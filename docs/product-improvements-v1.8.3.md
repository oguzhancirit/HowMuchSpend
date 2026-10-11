# DebTracker v1.8.3 — approved product improvements

11 October 2026. Baseline: v1.8.2 / Site commit 0a52d25e9de7f97f3e8e1f23c14bd8e9937e4a0c.

Scope: council suggestions C1/C5, quick wins E1/E2 and future direction F1. New entries default to pending and date changes never silently complete them. The existing card form shows its live equation and source labels. A collapsed explanation in the existing debt flow reconciles the change to the previous closing balance or, where there is no known previous month, the current opening. It separates manual opening corrections, new spending, entered costs, credit offset and payment applied to debt. Completed linked calendar records are escaped, amount-redacted in privacy mode and bounded to four rows with a calendar shortcut. Savings wording describes a planned-budget recommendation rather than available cash.

No storage keys or backup schemas change. No historical financial input or paid state is migrated. No production database/payment record is touched. No bank integration, interest forecast or notification scheduler change is introduced. Build 27 changes the existing release/service-worker identifiers so installed clients can receive the update at the same origin without reinstalling.

## Correctness checks

112 tests pass. Eight added regression tests cover pending defaults for past/today/future income and expense, preserving explicit choices through date handlers, manual opening corrections, excess payment and zero debt with credit, missing months/source, 120 deterministic accounting combinations, source-labelled/collapsed UI, live previews without writes, calendar-vs-manual replacement and escaped record names. Existing tests continue to cover privacy redaction, currency separation, savings transfer counting, calendar summaries/art, security boundaries, offline startup and open-form update protection. Syntax checks, Worker build and artifact validation pass.

## Local performance

Same host, untouched baseline snapshot; synthetic data only. Thirty warmups, nine alternating batches, median of batch means. Guardrail: added latency <= max(0.2 ms, 15% of baseline). This chosen threshold is not a confidence interval or a zero-regression promise.

| Operation | Baseline ms | Candidate ms | Difference ms |
|---|---:|---:|---:|
| API config | 0.0125 | 0.0125 | 0.0000 |
| Reminder sync PUT | 0.1980 | 0.1946 | -0.0034 |
| 1,000 recurring calendar entries | 2.1506 | 2.1541 | +0.0035 |
| Opening, mocked DOM | 1.7418 | 1.5549 | -0.1868 |
| Card detail HTML, one series | 0.5028 | 0.5102 | +0.0074 |
| Card detail HTML, 1,000 series | 7.8076 | 8.1411 | +0.3336 |

All six checks pass. The dense card view has measured overhead (~4.3%); opening's apparent improvement is noise, not a claimed device speedup. Worker bundle: 439,626 to 448,559 bytes (+8,933 / ~2.03%). No dependency or network request is added.

Raw results: product-improvements-performance-v1.8.3.json and product-improvements-card-performance-v1.8.3.json. Reproduce from the candidate root with `node scripts/performance-test.mjs /absolute/baseline` and `node scripts/card-performance-test.mjs /absolute/baseline /absolute/candidate`.

These measurements exclude real browser DOM/layout/paint, network, auth-provider integration, energy use and physical iPhone/PWA behavior. Browser-control skill is unavailable, so browser QA was not run. Mobile CSS uses constrained columns and wrapping; this is implementation intent, not verified screenshot evidence. No claim of guaranteed phone delivery or zero iPhone slowdown is made.
