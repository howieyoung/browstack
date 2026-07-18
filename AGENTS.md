# Browstack — Agent Onboarding Playbook

You are an AI coding agent (Claude Code, Codex, or similar) opened inside the Browstack project.
When the user says something like **"Scan this project and walk me through setting it up"**
(「請掃描這專案並為我解釋該如何操作」/「このプロジェクトをスキャンして使い方を説明して」etc.),
follow this playbook. **Always reply in the user's language.**

## What this project is

Browstack turns the user's own Chrome browsing history into a beautifully designed, privacy-first
personal weekly digest (a "personal New Yorker"), delivered to their inbox. Pipeline:
`ingest → enrich (LLM) → cover (art) → render → send (Gmail SMTP)`, schedulable weekly via launchd.
Everything runs locally; browsing data never leaves the machine.

## Hard rules for agents

1. **Never ask the user to paste an API key or password into the chat.** Give them the exact
   `security add-generic-password …` command (with a leading space) to run themselves in Terminal.
2. **Never commit or stage** `data/`, `out/`, `assets/covers/`, `src/shared/userConfig.ts`, `.env`.
   These contain personal browsing data or per-user config. Never weaken `.gitignore`.
3. **Never print the contents of `data/browstack.db`** beyond aggregate counts — it is the user's
   browsing history. Never send its contents anywhere.
4. **Never send email without the user asking.** `npm run send` actually sends.
5. macOS only (Keychain, launchd, sips). On other platforms, explain the limitation honestly.

## Onboarding flow (walk the user through, step by step)

Detect current state first, then only cover the missing steps. Verify each step before moving on.

### Step 0 — Environment check
```bash
node --version          # need >= 20
ls src/shared/userConfig.ts   # exists after npm install (postinstall creates it)
```
If missing deps: `npm install`.

### Step 1 — Personal config
Open `src/shared/userConfig.ts` with the user and fill in:
- `email.from` / `email.to` — their Gmail address (usually both the same)
- `chromeProfile` — usually `"Default"`; check `ls ~/Library/Application\ Support/Google/Chrome/`
- `noiseHosts` — their own products / work dashboards to exclude

### Step 2 — LLM (required: powers summaries & cover concepts)
Preferred: Claude Code CLI with their existing subscription:
```bash
claude /login    # user runs this once in Terminal
```
Verify: `echo hi | claude -p` answers. Alternative: set `llm.provider: "anthropic"` in
`src/config.ts` + `ANTHROPIC_API_KEY` env var.

### Step 3 — First issue (no other keys needed)
```bash
npm run ingest    # imports Chrome history locally; sensitive pages are never stored
npm run enrich    # LLM classifies knowledge content + writes summaries
npm run preview   # renders out/browstack-issue-0.html
open out/browstack-issue-0.html
```
Show the user their issue №0. The bundled default cover is used until Step 4 runs.

### Step 4 — Cover keys (strongly recommended: unique cover per issue)
Cover generation is two-part: LLM art director (Step 2) + image renderer.
- **With OpenAI key (best quality):** user creates a capped key at platform.openai.com, then runs
  (note the leading space):
  ```bash
   security add-generic-password -s browstack-openai -a "$USER" -w '<key>' -U
  ```
- **Without OpenAI key:** `npm run cover` automatically falls back to drawing an SVG cover with
  the subscription LLM (strongest model, high effort). Works, but raster covers look better.
Verify: `npm run cover` then `npm run preview` — the new cover appears.

### Step 5 — Email delivery (Gmail)
1. User creates an App password: Google Account → Security → 2-Step Verification → App passwords
   (https://myaccount.google.com/apppasswords)
2. User runs (leading space; use their Gmail address):
   ```bash
    security add-generic-password -s browstack-smtp -a user@example.com -w '<16-char app password>' -U
   ```
3. `npm run send` — the issue arrives in their inbox with the cover inlined.
   Sending **seals** the issue: the next run starts issue №N+1, and published items are
   permanently excluded from future issues.

### Step 6 — Extension (better reading signals; optional but recommended)
```bash
npm run build:ext
npm run serve     # local receiver on 127.0.0.1:8787 — keep running
```
Then: `chrome://extensions` → Developer mode → Load unpacked → select `extension/`.
Note: Step 7's `npm run schedule:weekly` installs the receiver as an always-on LaunchAgent
(`com.browstack.serve`, KeepAlive) — after that, no terminal needs to stay open.

### Step 7 — Weekly automation
```bash
npm run schedule:weekly                        # Saturdays 08:17 by default
npm run schedule:weekly -- --day 1 --hour 9    # or any day/time (--day 0-6, 0=Sunday)
```
Logs at `data/logs/weekly.log`. Uninstall:
`launchctl bootout gui/$UID/com.browstack.weekly && rm ~/Library/LaunchAgents/com.browstack.weekly.plist`

## Troubleshooting quick answers

- `claude -p` says "Not logged in" → run `claude /login` in a normal Terminal.
- macOS notification "Browstack 出刊失敗" / heartbeat credential warning, or logs show
  "OAuth session expired and could not be refreshed" → the standalone Claude CLI token expired
  (it decays when unused). Have the user run `claude /login` in Terminal, then run
  `npm run weekly` to ship this week's issue immediately. The daily 09:37 heartbeat exists
  precisely to keep this token fresh and warn before Saturday.
- Cover didn't change → is the OpenAI key in Keychain? (`security find-generic-password -s browstack-openai` exits 0). Otherwise SVG fallback / default cover is used.
- Email didn't arrive → check `security find-generic-password -s browstack-smtp` exists; app
  passwords require 2-Step Verification enabled.
- Empty issue → user needs ≥ a few days of Chrome browsing; check `npm run stats`.
- Mobile browsing missing → Chrome Sync must be on (same Google account on phone).

## Docs maintenance rule (for agents editing this repo)

READMEs exist in six languages: `README.md` (EN, canonical), `README.zh-TW.md`, `README.ja.md`,
`README.ko.md`, `README.es.md`, `README.fr.md`. **Any content change to one README must be
mirrored to all six in the same commit.** Keep code blocks identical across languages.
