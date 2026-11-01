# info-T1-fixture

## meta

- phase: T1
- title: checker fixture
- date: 2026-10-27
- status: done
- brief: orchestrator message

## commits

- deadbee | docs: DEC-028 implementer report format contract

## requirements

- DEC-028 | done | evidence: file:docs/server/reports/REPORT-FORMAT.md, commit:deadbee
- R2 | partial | evidence: test:apps/agent-server/tests/unit/test_hygiene.py::HygieneTest.test_stdlib_imports_only

## tests

- unit | cmd: cd apps/agent-server/tests && python3 -m unittest | 3/4 passed, 1 skipped, 0 failed | evidence: run:docs/server/reports/runs/T1/unit.log

## measurements

- node version | 24 | evidence: cmd:node --version => v24.x, 1 line

## decisions

- T1-1 | choice: one fixture | rejected: many fixtures | evidence: test:apps/agent-server/tests/unit/test_hygiene.py::HygieneTest.test_no_silent_except

## deviations

- none

## open_issues

- T1-I1 | severity: minor | target: P3 | evidence: file:docs/server/reports/REPORT-FORMAT.md

## files

- docs/server/reports/REPORT-FORMAT.md | contract
- scripts/gone.mjs | deleted in this phase

## how_to_run

- checker | cmd: node scripts/check-report.mjs

## handoff

- fenced blocks are allowed | evidence: file:`apps/agent-server/tests/__init__.py`

```text
anything goes inside a fence
```
