# Instruction Platform: Wave 1 Implementation Plan

**Spec:** [2026-10-10-instruction-platform-design.md](../specs/2026-10-10-instruction-platform-design.md)
**Date:** 2026-10-10

Wave 1 ships as small PRs into `develop`. PRs that build on unmerged work are stacked: each one targets the branch it depends on, and GitHub retargets it to `develop` when that branch merges.

## Pull Requests

| # | Branch | Base | Track | Scope |
| --- | --- | --- | --- | --- |
| 1 | `docs/instruction-platform-spec` | `develop` | — | This plan and the design spec |
| 2 | `chore/e2e-port-env` | `develop` | — | `E2E_PORT` for parallel e2e runs |
| 3 | `feature/ip-contracts` | `chore/e2e-port-env` | — | Instruction and build-run contracts, revisions, tolerances, fixtures |
| 4 | `feature/ip-step-graph` | `feature/ip-contracts` | A | `graph.ts` |
| 5 | `feature/ip-plan-validator` | `feature/ip-step-graph` | A | `validate.ts` |
| 6 | `feature/ip-readiness` | `feature/ip-contracts` | D | `readiness.ts` and the start gate |
| 7 | `feature/ip-lifecycle` | `feature/ip-readiness` | D | `lifecycle.ts` |
| 8 | `feature/composite-warnings` | `chore/e2e-port-env` | E | Composite warnings and warning-center navigation |
| 9 | `feature/project-package` | `chore/e2e-port-env` | F | `projectPackage.ts` domain |
| 10 | `feature/project-package-ui` | `feature/project-package` | F | Export and import project actions |
| 11 | `feature/bundle-fonts` | `chore/e2e-port-env` | G | `@fontsource` fonts, CSP tightened |
| 12 | `feature/static-host-config` | `feature/bundle-fonts` | G | `_headers`, `_redirects`, drift test, install docs |
| 13 | `feature/connection-notice` | `chore/e2e-port-env` | G | Secure-context notice, persistent storage request |
| 14 | `feature/ip-buildrun-progress` | `feature/ip-step-graph` | B | `progress.ts` |
| 15 | `feature/ip-buildrun-actuals` | `feature/ip-buildrun-progress` | B | `actuals.ts` |
| 16 | `feature/ip-resume-summary` | `feature/ip-buildrun-actuals` | B | `resume.ts` |
| 17 | `feature/ip-part-marking` | `feature/ip-plan-validator` | C | `boardMarking.ts` |
| 18 | `feature/ip-edge-grain-generator` | `feature/ip-part-marking` | C | Edge-grain generator, golden plan |
| 19 | `feature/ip-end-grain-generator` | `feature/ip-edge-grain-generator` | C | End-grain generator, dispatcher, golden plan |
| 20 | `feature/ip-composite-generator` | `feature/ip-end-grain-generator` | C4 | Composite generator, third golden plan |
| 21 | `feature/ip-steps-preview` | `feature/ip-end-grain-generator` | C5 | `PlanStepList` in the board designer |

## Dependency Graph

```text
develop
├── #1 docs
└── #2 e2e-port
    ├── #3 contracts
    │   ├── #4 graph ── #5 validator ── #17 marking ── #18 edge ── #19 end ─┬─ #20 composite
    │   │       └── #14 progress ── #15 actuals ── #16 resume               └─ #21 steps preview
    │   └── #6 readiness ── #7 lifecycle
    ├── #8 composite warnings
    ├── #9 package ── #10 package UI
    ├── #11 fonts ── #12 static host
    └── #13 connection notice
```

## Merge Order

1. Merge #1, #2, then #3.
2. Tracks merge independently, each in stack order: A (#4, #5), D (#6, #7), E (#8), F (#9, #10), G (#11, #12, #13), B (#14 to #16), C (#17 to #19), then #20 and #21.
3. Four PRs touch `src/App.tsx` (#8, #10, #13, #21) or `BoardDesigner.tsx` (#10, #21). Any of them may need a small rebase after an earlier one lands.
4. PRs are squash-merged. After a parent squash-merges, rebase each child onto `develop` with `git rebase --onto develop <old-parent-tip> <child>`, then force-push it.

## Implementer Rules

- Node 24 and pnpm 11 (`export PATH=~/.local/node24/bin:$PATH`).
- **Gates before every push:** `pnpm typecheck`, `pnpm lint`, and `pnpm test:coverage`. UI PRs also run their e2e specs with a unique `E2E_PORT`.
- One PR is one concern. Code, tests, and any doc update for that concern travel together.
- Domain code follows `CLAUDE.md`: millimeters, full precision, no React or DOM, `import type` for type-only imports, and a sibling test file in `tests/`.
- **Commit messages and PR descriptions carry no attribution lines.** No `Co-Authored-By` and no generated-with notes.
- Each PR description states its spec section, what it adds, test evidence, and the PR it is stacked on.
- Repository Markdown is one line per paragraph, not hard-wrapped.

## Exit Criteria for Wave 1

- Every PR above is open with green local gates, and every PR targeting `develop` has green CI.
- The three golden plans (edge, end, composite) validate with zero errors and match their snapshots.
- Every legacy stock and cut number reappears unchanged in the generated plans (parity tests).
- **Owed by Alex:** a hand-check of the golden plans against a real build before strategy Phase 2 exits.
