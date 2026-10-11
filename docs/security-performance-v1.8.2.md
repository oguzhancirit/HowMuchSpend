# DebTracker v1.8.2: security fixes and local performance comparison

11 October 2026. Baseline: v1.8.1 / Site source 0d1460d920e1a310f3c86982461740136de76c72.

Merged the isolated security fixes: stream the JSON body with a 2 MiB byte limit, check JSON content type and safely reject malformed input, bound Base64url push keys before decoding, and add browser security response headers. The response wrapper mutates freshly constructed response headers instead of allocating a second Response/Headers pair.

104 tests pass, including the seven security tests added during the isolated audit. Worker build and artifact validation pass. Worker bundle grows from 437,849 to 439,626 bytes (+1,777 bytes / approximately 0.41%). The client calendar and animations are unchanged apart from cache-version updates.

## Measurement

Run `node scripts/performance-test.mjs /absolute/path/to/unchanged/baseline` from the candidate checkout. The baseline needs public/, worker/, tests/ and package.json from v1.8.1. No real user records, production database or push providers are used.

30 warmups, nine alternating baseline/candidate batches, median of batch means. This is a Node local microbenchmark with synthetic data and a mocked DOM. It excludes network, actual D1 latency, real DOM layout/paint, iPhone Safari and cold browser startup. It cannot prove a device-level zero-regression claim.

| Operation | Baseline ms | Candidate ms | Difference ms |
|---|---:|---:|---:|
| API config | 0.0127 | 0.0163 | +0.0035 |
| Reminder sync PUT | 0.2006 | 0.2184 | +0.0178 |
| 1,000 recurring calendar entries | 2.1955 | 2.1987 | +0.0031 |
| App opening, mocked DOM | 1.7552 | 1.5827 | -0.1725 |

There is measurable API overhead, as expected for added validation/security headers, but it is less than 0.02 ms in this run. Calendar difference is +0.14%; the apparent opening improvement should be treated as measurement noise, not a claimed 9.83% production speedup.

All operations pass the explicit local guardrail: extra latency no greater than max(0.2 ms, 15% of baseline). This is a chosen regression threshold, not a confidence interval or a guarantee of identical performance. Raw measurements and counts are in security-performance-v1.8.2.json.

## Deployment and validation limits

Keep the same Site identity, origin, local-storage keys, audience and reminder cadence. CSP allows same-origin scripts/connections and inline styles used by existing animation code; it denies inline scripts, plugin objects and embedding. Auth-provider integration and iPhone installed-PWA behavior need real-browser validation. No browser-control skill is available in this environment, so real browser QA is unavailable.

A bounded read-only check of the existing Site entrypoint returned 403 without credentials and 200 with its existing service credential. Served HTML had no external script URLs or inline script blocks. This narrows the CSP integration risk; it is not a full OAuth-session, API-authorization or browser execution test. No dispatch endpoint was called during this validation.
