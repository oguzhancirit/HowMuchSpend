# DebTracker v1.9.2 — prioritize the Face ID request

12 October 2026. Baseline Site source 0992e774b6c2d7351c2a8c8d6705473bf51399c4 (v1.9.1/build29). Same Site origin/access, recovery keys, financial storage and reminder sender; no D1 migration or new dependency.

## Changes

- Before the passkey request, fetch only the small lock stylesheet and boot/lock code. The nine calendar/payment/savings preloads and full stylesheet move after navigator.credentials.get is invoked. Preloading downloads code without executing it; the financial app module is still imported only after server verification. The unlocked view waits for its stylesheet to avoid an unstyled flash. Hidden bank-picker images use lazy loading.
- Start update registration/checking after the passkey request begins or the unlocked view opens. A six-second fallback preserves updates when the gate bootstrap is broken/offline; manual update remains available. Locked resume events don't compete with the next assertion-options request. The existing cached notification worker is not removed or unregistered.
- Join the device and challenge-rate-limit reads: options now requires two D1 transport calls instead of three. Registration and signature verification still use SimpleWebAuthn. Preparing authentication options uses a fresh 32-byte cryptographically random server challenge without initializing certificate/ASN.1 code. Exact origin/RP/purpose, user presence/verification, challenge expiry and atomic single-use checks remain in force. No stateless, client-generated or persistent challenge is introduced.

## Validation

136 tests pass. Added checks cover a fresh 256-bit challenge and invalidated previous challenge, exact credential/RP/required verification, deferred initial update traffic, single update start, bounded fallback, locked resume network priority, and resource preparation after the OS prompt call. Existing signed P-256 fixtures, replay, wrong origin/RP/user/signature, recovery/disable, pending reconciliation, no financial reads before validation and push/calendar/savings tests remain passing. Syntax, build and packaged-artifact checks pass; six server suites also pass against the bundled Worker.

## Performance evidence and limits

The reproducible script scripts/lock-performance-test.mjs imports fresh packaged Workers in nine alternating samples and uses synthetic SQLite data with a controlled 25 ms delay per D1 transport call. Its median first options request is 105.55 → 53.16 ms; D1 calls 3 → 2. Fresh Node module evaluation is 60.00 → 55.24 ms. These timings include the controlled DB delay and are not measured Cloudflare/iPhone results.

Initial JS/CSS request budget: 13 files / 245,155 raw bytes / 69,336 gzip bytes → 4 files / 21,930 raw bytes / 8,008 gzip bytes, roughly 91% less raw or 88% less gzip data. This budget excludes icons/manifest, HTTP overhead and cache behavior; the main resources are delayed rather than removed. It is not a claim of 88% faster phone opening. Raw measurements are in lock-performance-v1.9.2.json.

Physical iPhone rendering, Sites sign-in latency, internet latency and Apple's credential/Continue UI were not measured; the required browser-control capability is unavailable. The updater's six-second fallback can still run during a stalled authentication request. Server verification still requires connectivity. No guarantee is made about Apple's sheet timing.
