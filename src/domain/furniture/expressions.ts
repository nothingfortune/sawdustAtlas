import { stronglyConnectedComponents } from './graph'
import type { DimExpr, FurnitureIssue, FurnitureParameter } from './types'

// Dimension expressions: the small arithmetic language behind parametric furniture
// ("height - top_t", "0.75in", "max(leg, 40mm)"). A hand-written tokenizer and
// recursive-descent evaluator: no eval, no Function (the CSP forbids them), and hard
// limits on length and nesting so untrusted imported text cannot hang or crash the app.
//
// Grammar (whitespace ignored):
//   expr    = term { ("+" | "-") term }
//   term    = unary { ("*" | "/") unary }
//   unary   = ("-" | "+") unary | primary
//   primary = number [unit] | name | ("min" | "max") "(" expr { "," expr } ")" | "(" expr ")"
// A bare number is millimeters; the unit suffix mm, cm, or in must touch the digits.

export const MAX_EXPRESSION_LENGTH = 200
export const MAX_EXPRESSION_DEPTH = 32

const UNIT_MM: Readonly<Record<string, number>> = { mm: 1, cm: 10, in: 25.4 }
const FUNCTIONS: Readonly<Record<string, (values: number[]) => number>> = {
  min: values => Math.min(...values),
  max: values => Math.max(...values),
}
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export type DimResult =
  | { ok: true; value: number }
  | { ok: false; code: 'expression-invalid' | 'unknown-parameter'; message: string }

export function isValidParameterName(name: string): boolean {
  // "__proto__" would silently vanish from the plain-object scope.
  return NAME.test(name) && name !== '__proto__'
}

/** Parameter names an expression mentions, in order of first appearance, without
 *  duplicates. Lenient: it works on text that does not parse, so the UI can still show
 *  what a half-typed expression depends on. Function names and unit suffixes are not
 *  names. */
export function referencedNames(source: string): string[] {
  const found = new Set<string>()
  for (const match of source.matchAll(/(?:\d+\.?\d*|\.\d+)[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*/g)) {
    const word = match[0]
    if (!/^[A-Za-z_]/.test(word)) continue
    const isCall = word in FUNCTIONS && /^\s*\(/.test(source.slice(match.index + word.length))
    if (!isCall) found.add(word)
  }
  return [...found]
}

export function evaluateDim(value: DimExpr, scope: Readonly<Record<string, number>>): DimResult {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { ok: true, value } : fail('expression-invalid', 'The value is not a finite number.')
  }
  try {
    return { ok: true, value: new Evaluator(value, scope).run() }
  } catch (error) {
    if (error instanceof ExpressionError) return { ok: false, code: error.code, message: error.message }
    throw error
  }
}

/** Evaluates parameters in dependency order. A parameter that fails (bad name, duplicate
 *  name, bad expression, unknown or failed dependency, cycle) is absent from `values`
 *  and explained by an issue; anything that depends on it fails in turn. */
export function evaluateParameters(parameters: readonly FurnitureParameter[]): { values: Record<string, number>; issues: FurnitureIssue[] } {
  const values: Record<string, number> = {}
  const issues: FurnitureIssue[] = []
  const report = (parameter: FurnitureParameter, code: FurnitureIssue['code'], message: string, field?: string) => {
    issues.push({ code, severity: 'error', message, parameterId: parameter.id, ...(field ? { field } : {}) })
  }

  // The first parameter with a name owns it; later ones are duplicates.
  const owners = new Map<string, FurnitureParameter>()
  const usable: FurnitureParameter[] = []
  for (const parameter of parameters) {
    if (!isValidParameterName(parameter.name)) {
      report(parameter, 'expression-invalid', `"${parameter.name}" is not a valid parameter name. Use letters, digits, and underscores, starting with a letter or underscore.`)
    } else if (owners.has(parameter.name)) {
      report(parameter, 'duplicate-parameter', `Another parameter is already named "${parameter.name}".`)
    } else {
      owners.set(parameter.name, parameter)
      usable.push(parameter)
    }
  }

  const dependencies = new Map<FurnitureParameter, FurnitureParameter[]>()
  for (const parameter of usable) {
    const names = typeof parameter.value === 'string' ? referencedNames(parameter.value) : []
    dependencies.set(parameter, names.flatMap(name => owners.get(name) ?? []))
  }

  for (const group of stronglyConnectedComponents(usable, parameter => dependencies.get(parameter)!)) {
    const first = group[0]!
    if (group.length > 1 || dependencies.get(first)!.includes(first)) {
      const names = group.map(member => `"${member.name}"`).join(', ')
      for (const member of group) {
        report(member, 'parameter-cycle', group.length === 1 ? `"${member.name}" refers to itself.` : `Parameters refer to each other in a loop: ${names}.`, 'value')
      }
      continue
    }
    const broken = dependencies.get(first)!.find(dependency => !Object.hasOwn(values, dependency.name))
    if (broken) {
      report(first, 'unknown-parameter', `"${first.name}" depends on "${broken.name}", which has an error.`, 'value')
      continue
    }
    const result = evaluateDim(first.value, values)
    if (result.ok) values[first.name] = result.value
    else report(first, result.code, result.message, 'value')
  }
  return { values, issues }
}

// ---- Tokenizer and evaluator -----------------------------------------------------

type Token =
  | { kind: 'number'; text: string; value: number }
  | { kind: 'name'; text: string }
  | { kind: 'symbol'; text: '+' | '-' | '*' | '/' | '(' | ')' | ',' }
  | { kind: 'end'; text: '' }

class ExpressionError extends Error {
  constructor(readonly code: 'expression-invalid' | 'unknown-parameter', message: string) {
    super(message)
  }
}

function fail(code: 'expression-invalid' | 'unknown-parameter', message: string): DimResult {
  return { ok: false, code, message }
}

function invalid(message: string): ExpressionError {
  return new ExpressionError('expression-invalid', message)
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let at = 0
  while (at < source.length) {
    const char = source[at]!
    if (/\s/.test(char)) {
      at += 1
    } else if (/[+\-*/(),]/.test(char)) {
      tokens.push({ kind: 'symbol', text: char as Extract<Token, { kind: 'symbol' }>['text'] })
      at += 1
    } else if (/[0-9.]/.test(char)) {
      const digits = /^(?:\d+\.?\d*|\.\d+)/.exec(source.slice(at))
      if (!digits) throw invalid(`Unexpected "${char}".`)
      at += digits[0].length
      const suffix = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(at))
      let factor = 1
      if (suffix) {
        const unit = UNIT_MM[suffix[0]]
        if (unit === undefined) throw invalid(`Unknown unit "${suffix[0]}" after ${digits[0]}. Use mm, cm, or in.`)
        factor = unit
        at += suffix[0].length
      }
      tokens.push({ kind: 'number', text: digits[0] + (suffix?.[0] ?? ''), value: Number(digits[0]) * factor })
    } else if (/[A-Za-z_]/.test(char)) {
      const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(at))![0]
      tokens.push({ kind: 'name', text: word })
      at += word.length
    } else {
      throw invalid(`Unexpected character "${char}".`)
    }
  }
  tokens.push({ kind: 'end', text: '' })
  return tokens
}

/** Evaluates while parsing: the first problem in reading order is the one reported. */
class Evaluator {
  private readonly tokens: Token[]
  private at = 0
  private depth = 0

  constructor(source: string, private readonly scope: Readonly<Record<string, number>>) {
    if (source.length > MAX_EXPRESSION_LENGTH) throw invalid(`The expression is longer than ${MAX_EXPRESSION_LENGTH} characters.`)
    this.tokens = tokenize(source)
  }

  run(): number {
    if (this.peek().kind === 'end') throw invalid('The expression is empty.')
    const value = this.expression()
    const extra = this.peek()
    if (extra.kind !== 'end') throw invalid(`Unexpected ${describe(extra)}.`)
    return value
  }

  private peek(): Token {
    return this.tokens[this.at]!
  }

  private take(): Token {
    const token = this.peek()
    if (token.kind !== 'end') this.at += 1
    return token
  }

  private isSymbol(text: string): boolean {
    const token = this.peek()
    return token.kind === 'symbol' && token.text === text
  }

  private nest<T>(body: () => T): T {
    this.depth += 1
    if (this.depth > MAX_EXPRESSION_DEPTH) throw invalid(`The expression is nested deeper than ${MAX_EXPRESSION_DEPTH} levels.`)
    try {
      return body()
    } finally {
      this.depth -= 1
    }
  }

  private expression(): number {
    let value = this.term()
    while (this.isSymbol('+') || this.isSymbol('-')) {
      const plus = this.take().text === '+'
      const right = this.term()
      value = checked(plus ? value + right : value - right)
    }
    return value
  }

  private term(): number {
    let value = this.unary()
    while (this.isSymbol('*') || this.isSymbol('/')) {
      const times = this.take().text === '*'
      const right = this.unary()
      if (!times && right === 0) throw invalid('Division by zero.')
      value = checked(times ? value * right : value / right)
    }
    return value
  }

  private unary(): number {
    if (this.isSymbol('-') || this.isSymbol('+')) {
      const negate = this.take().text === '-'
      const value = this.nest(() => this.unary())
      return negate ? -value : value
    }
    return this.primary()
  }

  private primary(): number {
    const token = this.take()
    switch (token.kind) {
      case 'number':
        return token.value
      case 'name':
        return this.isSymbol('(') ? this.call(token.text) : this.lookup(token.text)
      case 'symbol':
        if (token.text === '(') {
          const value = this.nest(() => this.expression())
          this.expect(')')
          return value
        }
        throw invalid(`Unexpected ${describe(token)}.`)
      case 'end':
        throw invalid('The expression ends too soon.')
    }
  }

  private call(name: string): number {
    const apply = Object.hasOwn(FUNCTIONS, name) ? FUNCTIONS[name] : undefined
    if (!apply) throw invalid(`Unknown function "${name}". Only min and max are available.`)
    this.take()
    const args = this.nest(() => {
      const list = [this.expression()]
      while (this.isSymbol(',')) {
        this.take()
        list.push(this.expression())
      }
      return list
    })
    this.expect(')')
    return apply(args)
  }

  private expect(text: ')'): void {
    if (!this.isSymbol(text)) {
      const token = this.peek()
      throw invalid(token.kind === 'end' ? `A closing "${text}" is missing.` : `Expected "${text}" but found ${describe(token)}.`)
    }
    this.take()
  }

  private lookup(name: string): number {
    if (!Object.hasOwn(this.scope, name)) throw new ExpressionError('unknown-parameter', `Unknown parameter "${name}".`)
    return this.scope[name]!
  }
}

function checked(value: number): number {
  if (!Number.isFinite(value)) throw invalid('The result is too large to use.')
  return value
}

function describe(token: Token): string {
  switch (token.kind) {
    case 'number': return `number "${token.text}"`
    case 'name': return `name "${token.text}"`
    case 'symbol': return `"${token.text}"`
    case 'end': return 'end of the expression'
  }
}
