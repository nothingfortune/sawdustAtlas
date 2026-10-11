import { describe, expect, it } from 'vitest'
import { evaluateDim, evaluateParameters, isValidParameterName, referencedNames } from '../src/domain/furniture/expressions'
import type { FurnitureParameter } from '../src/domain/furniture/types'

const scope = { width: 1200, depth: 700, top_t: 25, _x: 3 }

function ok(source: string | number, vars: Record<string, number> = scope): number {
  const result = evaluateDim(source, vars)
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`)
  return result.value
}

function failure(source: string | number, vars: Record<string, number> = scope) {
  const result = evaluateDim(source, vars)
  if (result.ok) throw new Error(`expected failure, got ${result.value}`)
  return result
}

const param = (name: string, value: FurnitureParameter['value'], id = `p-${name}`): FurnitureParameter => ({ id, name, label: name, value })

describe('isValidParameterName', () => {
  it.each(['a', 'A1', '_x', 'top_t', 'leg2', 'min', 'in'])('accepts %s', name => expect(isValidParameterName(name)).toBe(true))
  it.each(['', '1a', 'a-b', 'a b', 'a.b', 'é', '__proto__'])('rejects %j', name => expect(isValidParameterName(name)).toBe(false))
})

describe('referencedNames', () => {
  it('lists names once in order of first appearance', () => {
    expect(referencedNames('width - 2*leg - leg + width')).toEqual(['width', 'leg'])
  })

  it('ignores numbers, unit suffixes, and the min and max calls', () => {
    expect(referencedNames('0.75in + 3mm + max(a, min(b, 2cm))')).toEqual(['a', 'b'])
  })

  it('treats min and max as names when they are not called', () => {
    expect(referencedNames('min + max (1, 2)')).toEqual(['min'])
  })

  it('works on text that does not parse', () => {
    expect(referencedNames('a + (b *')).toEqual(['a', 'b'])
    expect(referencedNames('')).toEqual([])
  })
})

describe('evaluateDim literals and numbers', () => {
  it('returns a literal number unchanged at full precision', () => {
    expect(ok(445.5)).toBe(445.5)
    expect(ok(-12.000000001)).toBe(-12.000000001)
    expect(ok(0)).toBe(0)
  })

  it('rejects a non-finite literal', () => {
    for (const value of [Number.NaN, Infinity, -Infinity]) expect(failure(value).code).toBe('expression-invalid')
  })

  it('parses a string holding only a number as a literal', () => {
    expect(ok('12')).toBe(12)
    expect(ok(' 0.75 ')).toBe(0.75)
    expect(ok('.5')).toBe(0.5)
    expect(ok('3.')).toBe(3)
  })

  it('applies mm, cm, and in suffixes', () => {
    expect(ok('25mm')).toBe(25)
    expect(ok('2.5cm')).toBe(25)
    expect(ok('1in')).toBe(25.4)
    expect(ok('0.75in')).toBe(0.75 * 25.4)
    expect(ok('.5in')).toBe(12.7)
  })

  it('treats a bare number as millimeters', () => {
    expect(ok('1 + 1in')).toBe(26.4)
  })
})

describe('evaluateDim operators', () => {
  it('follows precedence and associativity', () => {
    expect(ok('2 + 3 * 4')).toBe(14)
    expect(ok('10 - 2 - 3')).toBe(5)
    expect(ok('100 / 5 / 2')).toBe(10)
    expect(ok('(2 + 3) * 4')).toBe(20)
    expect(ok('2 * (3 + (4 - 1))')).toBe(12)
  })

  it('supports unary minus and plus, stacked', () => {
    expect(ok('-5')).toBe(-5)
    expect(ok('+5')).toBe(5)
    expect(ok('--5')).toBe(5)
    expect(ok('3 - -2')).toBe(5)
    expect(ok('-(2 + 3)')).toBe(-5)
    expect(ok('-width')).toBe(-1200)
    expect(ok('2 * -3')).toBe(-6)
  })

  it('ignores whitespace anywhere', () => {
    expect(ok(' ( 1 +\t2 )\n* 3 ')).toBe(9)
  })

  it('reads parameter names, including underscores', () => {
    expect(ok('width - 2*top_t')).toBe(1150)
    expect(ok('_x * _x')).toBe(9)
    expect(ok('depth/2 + 1in')).toBe(375.4)
  })

  it('does not round: results keep full float precision', () => {
    expect(ok('(width - 2*18) / 4')).toBe((1200 - 36) / 4)
    expect(ok('0.1 + 0.2')).toBe(0.1 + 0.2)
  })

  it('evaluates min and max with any number of arguments', () => {
    expect(ok('min(3, 1, 2)')).toBe(1)
    expect(ok('max(3, 1, 2)')).toBe(3)
    expect(ok('max(7)')).toBe(7)
    expect(ok('max(width - 1000, 100)')).toBe(200)
    expect(ok('min(max(1, 5), 3 + 4)')).toBe(5)
    expect(ok('max (1, 2)')).toBe(2)
    expect(ok('max(1in, 20)')).toBe(25.4)
  })

  it('lets a parameter be called min or max when it is not called as a function', () => {
    expect(ok('min + max', { min: 1, max: 2 })).toBe(3)
  })
})

describe('evaluateDim errors', () => {
  it('reports an unknown name as unknown-parameter, naming it', () => {
    const result = failure('width - gap')
    expect(result.code).toBe('unknown-parameter')
    expect(result.message).toContain('"gap"')
  })

  it('does not find names on the prototype chain', () => {
    expect(failure('constructor', {}).code).toBe('unknown-parameter')
    expect(failure('toString + 1', {}).code).toBe('unknown-parameter')
  })

  it('rejects an empty or blank string', () => {
    expect(failure('').code).toBe('expression-invalid')
    expect(failure('   ').message).toContain('empty')
  })

  it.each([
    ['1 +', 'ends too soon'],
    ['* 2', '"*"'],
    ['(1 + 2', 'closing ")"'],
    ['1 + 2)', 'Unexpected ")"'],
    ['1 2', 'number "2"'],
    ['width depth', 'name "depth"'],
    ['2 $ 3', 'character "$"'],
    ['1.2.3', 'number ".3"'],
    ['.', 'Unexpected "."'],
    ['()', 'Unexpected ")"'],
    ['min()', 'Unexpected ")"'],
    ['min(1,)', 'Unexpected ")"'],
    ['max(1 2)', 'Expected ")"'],
    ['min(1, 2', 'closing ")"'],
    ['2 ^ 3', 'character "^"'],
    ['5 in', 'name "in"'],
    ['1e3', 'Unknown unit "e3"'],
    ['5ft', 'Unknown unit "ft"'],
    ['5mm2', 'Unknown unit "mm2"'],
    ['sqrt(4)', 'Unknown function "sqrt"'],
    ['width(2)', 'Unknown function "width"'],
    ['toString(2)', 'Unknown function "toString"'],
    ['1, 2', '","'],
  ])('rejects %j as expression-invalid (%s)', (source, fragment) => {
    const result = failure(source)
    expect(result.code).toBe('expression-invalid')
    expect(result.message).toContain(fragment)
  })

  it('rejects division by zero, including a zero parameter and a zero expression', () => {
    expect(failure('1 / 0').message).toContain('Division by zero')
    expect(failure('width / (top_t - 25)').code).toBe('expression-invalid')
    expect(failure('1 / z', { z: 0 }).code).toBe('expression-invalid')
    expect(ok('0 / 5')).toBe(0)
  })

  it('rejects a non-finite result', () => {
    const result = failure('a * a * a', { a: 1e150 })
    expect(result.code).toBe('expression-invalid')
    expect(result.message).toContain('too large')
    expect(failure('a + a', { a: Number.MAX_VALUE }).code).toBe('expression-invalid')
  })

  it('enforces the 200 character limit', () => {
    expect(ok(`1${' '.repeat(197)}+1`)).toBe(2)
    const result = failure(`1${' '.repeat(198)}+1`)
    expect(result.code).toBe('expression-invalid')
    expect(result.message).toContain('200')
  })

  it('allows nesting up to 32 levels and rejects deeper', () => {
    const nest = (levels: number) => `${'('.repeat(levels)}1${')'.repeat(levels)}`
    expect(ok(nest(32))).toBe(1)
    const result = failure(nest(33))
    expect(result.code).toBe('expression-invalid')
    expect(result.message).toContain('32')
  })

  it('counts function calls and stacked unary signs toward the depth limit', () => {
    expect(ok(`${'max('.repeat(32)}1${')'.repeat(32)}`)).toBe(1)
    expect(failure(`${'max('.repeat(33)}1${')'.repeat(33)}`).code).toBe('expression-invalid')
    expect(ok(`${'-'.repeat(32)}1`)).toBe(1)
    expect(failure(`${'-'.repeat(33)}1`).code).toBe('expression-invalid')
  })

  it('reports the first problem in reading order', () => {
    expect(failure('gap + (').code).toBe('unknown-parameter')
    expect(failure('1 + * gap').code).toBe('expression-invalid')
  })
})

describe('evaluateParameters', () => {
  it('evaluates literals and expressions in dependency order, whatever the array order', () => {
    const { values, issues } = evaluateParameters([
      param('inner', 'outer - 2*t'),
      param('t', 18),
      param('outer', 'width / 2'),
      param('width', '800'),
    ])
    expect(issues).toEqual([])
    expect(values).toEqual({ width: 800, outer: 400, t: 18, inner: 364 })
  })

  it('returns empty results for no parameters', () => {
    expect(evaluateParameters([])).toEqual({ values: {}, issues: [] })
  })

  it('resolves a diamond of dependencies', () => {
    const { values, issues } = evaluateParameters([param('d', 'b + c'), param('b', 'a + 1'), param('c', 'a + 2'), param('a', 10)])
    expect(issues).toEqual([])
    expect(values['d']).toBe(23)
  })

  it('flags an invalid name on that parameter and leaves it out', () => {
    const { values, issues } = evaluateParameters([param('good', 1), param('2bad', 5, 'p-bad')])
    expect(values).toEqual({ good: 1 })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'expression-invalid', severity: 'error', parameterId: 'p-bad' })
  })

  it('keeps the first of duplicate names and flags the later ones', () => {
    const { values, issues } = evaluateParameters([param('w', 10, 'first'), param('w', 99, 'second'), param('x', 'w * 2')])
    expect(values).toEqual({ w: 10, x: 20 })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'duplicate-parameter', parameterId: 'second' })
  })

  it('reports a bad expression with the value field and skips only its dependents', () => {
    const { values, issues } = evaluateParameters([param('a', '2 * ('), param('b', 'a + 1'), param('c', 5)])
    expect(values).toEqual({ c: 5 })
    expect(issues.map(issue => [issue.parameterId, issue.code, issue.field])).toEqual([
      ['p-a', 'expression-invalid', 'value'],
      ['p-b', 'unknown-parameter', 'value'],
    ])
    expect(issues[1]!.message).toContain('"a"')
  })

  it('reports an unknown name in a parameter', () => {
    const { values, issues } = evaluateParameters([param('a', 'nothing * 2')])
    expect(values).toEqual({})
    expect(issues[0]).toMatchObject({ code: 'unknown-parameter', parameterId: 'p-a', field: 'value' })
  })

  it('reports a self reference as a cycle', () => {
    const { values, issues } = evaluateParameters([param('a', 'a + 1')])
    expect(values).toEqual({})
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'parameter-cycle', parameterId: 'p-a', field: 'value' })
  })

  it('reports a cycle on every member and leaves them out, while dependents fail and bystanders survive', () => {
    const { values, issues } = evaluateParameters([
      param('a', 'b + 1'),
      param('b', 'c + 1'),
      param('c', 'a + 1'),
      param('after', 'a * 2'),
      param('free', 7),
    ])
    expect(values).toEqual({ free: 7 })
    const byCode = (code: string) => issues.filter(issue => issue.code === code).map(issue => issue.parameterId).sort()
    expect(byCode('parameter-cycle')).toEqual(['p-a', 'p-b', 'p-c'])
    expect(byCode('unknown-parameter')).toEqual(['p-after'])
  })

  it('finds two separate cycles and a cycle with a tail', () => {
    const { values, issues } = evaluateParameters([
      param('a', 'b'), param('b', 'a'),
      param('c', 'd'), param('d', 'c + e'), param('e', 4),
    ])
    expect(values).toEqual({ e: 4 })
    expect(issues.filter(issue => issue.code === 'parameter-cycle').map(issue => issue.parameterId).sort()).toEqual(['p-a', 'p-b', 'p-c', 'p-d'])
  })

  it('is deterministic: the same input gives the same issues in the same order', () => {
    const input = [param('a', 'b'), param('b', 'a'), param('c', 'zzz')]
    expect(evaluateParameters(input)).toEqual(evaluateParameters(input))
  })

  it('does not treat a self reference through min/max calls as anything else', () => {
    const { issues } = evaluateParameters([param('a', 'max(a, 1)')])
    expect(issues[0]!.code).toBe('parameter-cycle')
  })

  it('matches the table fixture parameters', () => {
    const { values, issues } = evaluateParameters([
      param('width', 1200), param('leg', 45), param('overhang', 25), param('span', 'width - 2*overhang - 2*leg'),
    ])
    expect(issues).toEqual([])
    expect(values['span']).toBe(1060)
  })
})
