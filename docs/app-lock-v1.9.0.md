# DebTracker v1.9.0 — optional Face ID / passkey app lock

12 October 2026. Existing Site, audience, origin and financial storage keys retained. This is a secondary app lock; Sites/ChatGPT still authenticates the owner. No bank transfer, financial-record migration, new automation or audience change.

## Use

Settings → Uygulama kilidi → Etkinleştir. Save the 128-bit recovery code, then create a platform passkey. Every fresh launch gates the application module before financial storage is read. Leaving the app hides the shell and open sheets immediately; returning within 60 seconds resumes the unlocked session. Longer absences and back-forward-cache restoration require verification. Manual lock and verified disable are available in Settings. Recovery clears only lock credentials, not ledger, card tracking, savings or push subscriptions. Site access and a network connection are required to verify/recover. iOS can use device passcode instead of Face ID; a web app cannot require Face ID specifically.

## Boundaries

This is not at-rest encryption of localStorage or a replacement for Sites access control. Someone controlling browser storage or developer tools can bypass a frontend gate. Device/browser clearing can still erase financial records; the passkey and recovery code do not back them up. Service-worker notifications continue without loading/unlocking the UI, and retain the user's existing notification-detail preference. Safari and Home Screen storage remain independent.

Server records contain a hashed per-installation bearer, Site identity, public key/counter/origin and a recovery-code hash. The server never receives biometric data or a private passkey. Same-origin POST, authenticated Site identity, bounded 64 KiB body, exact origin/RP/challenge, required user presence/verification and one-use, two-minute challenges are checked. Purposes cannot be exchanged; existing enabled keys cannot be overwritten. Recovery and disable leave a credential-free tombstone so interrupted responses can be reconciled without treating a missing database record as proof of successful recovery. Only schema additions are migrated. No real enrollment or recovery is performed during development.

Pinned SimpleWebAuthn server verifies the protocol; registration requests none attestation and P-256. The verifier is initialized only on a passkey operation. Worker bundling uses esbuild; no library is shipped to the browser. API/authentication routes are never cached by the service worker. Build 28 updates the installed app in place.

## Verification

126 tests pass, including real P-256 fixtures in SQLite for enrollment/authentication/disable/recovery; replay, expired challenge, wrong signature/origin/RP/identity/user-verification, oversized/cross-origin/anonymous requests; gated module startup, enrollment recovery-code acknowledgement, offline/corrupt-state failure, background grace, bfcache and interrupted enrollment/recovery. The five server suites also pass against the packaged Worker. Syntax, ESM build and artifact validation pass. Fixtures are synthetic; no phone notification or user payment is generated.

Six existing local performance comparisons pass their predefined absolute/relative guardrails (opening's mock-DOM median +0.1083 ms; dense card HTML +0.2081 ms). This does not prove zero slowdown. Browser JS compressed size rises about 4.4 KiB. Worker grows 448,559 → 769,627 bytes; local fresh-module evaluation median 13.64 → 28.31 ms. This measured ~14.67 ms cold overhead is disclosed rather than hidden by warm-route averages. No added authentication network request occurs with lock disabled; lock enabled intentionally adds options + verification round trips. Raw results are committed alongside this report.

Real iPhone/Home Screen Face ID, browser rendering, provider cold starts and end-to-end network timings were not tested: the required browser-control capability is unavailable. Enable from the installed iPhone app, not a separate Safari data container, and verify the real-device prompt before relying on it.
