# Security Policy

Browstack turns your own Chrome browsing history into a private weekly digest.
Everything runs locally; your browsing data never leaves your machine. Because the
project is open source, its security rests entirely on design that is safe **even
though an attacker can read every line of this code** — not on anything being secret.

This document states honestly what Browstack protects, what it does not, and how to
report a problem.

## Reporting a vulnerability

Please report security issues **privately** to **howie@protico.io**.
Do **not** open a public GitHub issue with a working proof-of-concept — every user
runs a resident local server, so a public exploit puts the whole user base at risk
before a fix ships. We'll acknowledge and work with you on a coordinated disclosure.

## Threat model — what is and isn't protected

1. **Same-user code is out of scope (by design).** Any program running as your macOS
   user account can read `data/browstack.db` (your history) and any local secret,
   directly from disk. A local infostealer with your UID is not something a local
   tool can defend against. Keep your machine free of malware.

2. **The archive link's security equals your email account's security.** The weekly
   email contains a link with a capability token (`?k=…`) that opens your local
   archive. Anyone who can read that email can open the archive on your machine.
   The token lives in your inbox (and Google's link-scanner logs / synced devices).
   Treat it like an account credential. Rotate it any time with:

   ```bash
   npm run token:rotate   # old email links stop working; the next issue carries a fresh one
   ```

3. **On a multi-user Mac, security depends on file permissions.** Browstack tightens
   `data/`, `out/`, and `assets/covers/` to `0700` and the database and logs to `0600`
   on every run, so other local accounts cannot read your history. If you loosen these
   permissions, other users on the same Mac can read your data.

4. **The archive adds a local attack surface that pure ingest did not have.** A
   readable HTTP endpoint on `127.0.0.1:8787` now serves history-derived pages. It is
   defended by: loopback-only bind, an exact `Host` allowlist (anti-DNS-rebinding), a
   256-bit capability token, and a strict `Content-Security-Policy`. These controls
   must not be weakened. The email link only works **on the same Mac while the receiver
   is running** — it is a dead link on a phone or any other device, by design.

## Security invariants (enforced in CI)

Changes to security-critical files (`src/server.ts`, `src/shared/settings.ts`,
`src/fetch/extract.ts`, `.gitignore`, and the archive modules) require a code-owner
review, and CI asserts the invariants below. Please do not "simplify" past them:

- The server binds `127.0.0.1` only — never `0.0.0.0` or a configurable address.
- The `Host` check is an **exact** allowlist — never `includes`/`startsWith`/regex.
- The capability token is CSPRNG-only, compared in constant time, and **fails closed**
  when absent — never a hardcoded/default/derived value, never minted in a request handler.
- The CSP has no `script-src` and no `unsafe-eval`; `default-src 'none'` stays.
- `POST /capture` requires `Content-Type: application/json`.
- `jsdom` parses hostile page HTML with inert defaults — never `runScripts` or
  `resources: "usable"`.

## Operational note

The resident receiver (`com.browstack.serve`) is launched by launchd with a pinned
Node path. A Node upgrade (nvm/Homebrew) can invalidate that path and silently stop
the receiver — email links then fail to connect and captured reading is queued (and
eventually dropped past 300 items). The daily heartbeat probes `/health` and warns
via Notification Center if the receiver is down. If links stop working, re-run
`npm run schedule:weekly`.
