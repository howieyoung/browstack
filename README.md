# Browstack

**English** · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md)

**Browser + Substack** — turn your own browsing history into a beautifully designed, privacy-first personal weekly digest, delivered to your inbox like a real newsletter.

<p align="center">
  <img src="docs/images/sample-cover.jpg" width="420" alt="Sample engine-generated cover in The New Yorker illustration tradition" />
  <br/>
  <em>Every issue gets a freshly generated cover in The New Yorker illustration tradition,<br/>themed on what you actually read that week.</em>
</p>

## Why

You tap articles from social feeds all day, never finish them, and they pile up in bookmarks you'll never revisit. Browstack's core insight: **browsing itself is the input**. Your history already lives on your machine — no "save" button needed. Browstack reads it locally, keeps only knowledge-type content, summarizes each piece well enough to replace re-reading it, and typesets everything into a weekly issue worth keeping.

**You are your own publisher.** Every issue is private by default — publishing anything outward is always an explicit, per-item opt-in.

> ### ⚡ Fastest path: see your issue №0 in three minutes
>
> ```bash
> git clone https://github.com/howieyoung/browstack.git && cd browstack
> npm install                          # creates your personal config file
> claude /login                        # use your Claude subscription as the LLM (or an API key)
> npm run ingest && npm run enrich && npm run preview
> open out/browstack-issue-0.html      # your preview issue!
> ```
>
> These five steps need **no paid API key**: your existing Chrome history, the Claude Code CLI (no extra key), and a bundled default cover. Add an AI-generated cover (OpenAI) and email delivery (Gmail) later via the one-time setup guides below.

### 🤖 Or just let your AI agent set everything up

After cloning, open **Claude Code** (or Codex, or any coding agent) inside this folder and say:

> **"Scan this project and walk me through setting it up."**

The repo ships with [AGENTS.md](AGENTS.md) — a step-by-step playbook your agent follows to configure everything *with* you: personal config, LLM login, your first issue, cover-art keys, Gmail delivery, the Chrome extension, and the weekly schedule. It also enforces the privacy rules (your keys go into the macOS Keychain, never into the chat).

## How it works

```
Chrome History ─┐
                ├→ classify → enrich → cover → render → send
Extension ──────┘   (knowledge   (LLM      (art     (nameplate,  (SMTP,
 (true reading       filter +     summar-   director  topics,      inline
  signals)           privacy      ies)      + image    summaries)   cover)
                     firewall)              engine)
```

- **Ingest** — reads Chrome's local History database (a copy — Chrome locks the original). If Chrome Sync is on, your phone's browsing is included automatically.
- **Extension (MV3)** — counts *active* reading seconds (tab visible + recent interaction) and captures article text at the moment you read it, including behind login walls. Talks **only to `127.0.0.1`** — nothing ever leaves your machine.
- **Classify** — hard rule: non-knowledge content (gossip, lotteries, promos, quick lookups) never makes the issue, no matter how long you lingered. Sensitive pages (banking, mail, auth, government services) are never even stored.
- **Enrich** — an LLM writes three bullets + one takeaway per article, and a one-line editorial context per social post.
- **Cover** — an LLM art director distills the week into a single visual metaphor, then an image engine renders it under a fixed art direction (flat gouache, limited palette, generous negative space — no text in the art).
- **Render & send** — magazine nameplate (issue №, date range, wordmark, tagline), topic-grouped summaries, weekly stats. Every item shows **how long you read it that week** — the reason it was picked. Sent via your own Gmail SMTP with the cover inlined as a CID attachment.
- **No self-feeding loop** — once an issue is sent, its items are sealed (`published_in`) and can never reappear, even if you revisit them from the digest itself.

## Privacy principles

1. **Local-first.** Parsing, filtering, ranking all happen on your machine. The extension's only network peer is `127.0.0.1`.
2. **Filter before any cloud call.** Only extracted article text of pages classified as content ever reaches an LLM. Banking, mail, auth, and government pages never leave the machine — they are not even written to Browstack's own database.
3. **Secrets live in the macOS Keychain**, not in dotfiles or env exports.
4. **Publishing is opt-in per item.** There is no auto-publish path.

## Requirements

- macOS 13+ (Keychain + `sips` are used; Linux/Windows would need small substitutions)
- Google Chrome (Chrome Sync recommended — brings mobile browsing into the digest)
- Node.js 20+
- An LLM: [Claude Code CLI](https://claude.com/claude-code) (uses your existing subscription) **or** an Anthropic API key
- Optional: an OpenAI API key (cover image rendering), a Gmail account (email delivery)

## Quick start

```bash
git clone https://github.com/<you>/browstack.git
cd browstack
npm install                 # also creates src/shared/userConfig.ts from the template
$EDITOR src/shared/userConfig.ts   # your email, Chrome profile, personal noise domains

npm run ingest              # import & classify your Chrome history (local only)
npm run stats               # sanity check: classification stats + top candidates
npm run enrich              # LLM: knowledge filter + summaries  (see LLM setup below)
npm run cover               # generate this issue's cover        (see OpenAI setup below)
npm run preview             # writes out/browstack-issue-0.html — open it!
npm run send                # email the issue to yourself        (see Gmail setup below)
```

### Extension (true reading signals)

```bash
npm run build:ext
npm run serve               # local receiver on 127.0.0.1:8787 — keep it running
```

Then open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `extension/` folder. Pages you actively read for 30+ seconds are captured (text + scroll depth + active seconds) and land in the local database. The popup shows receiver status and queue length.

## One-time setup guides

### 1 · LLM provider

**Option A — Claude Code CLI (default, no API key to manage):**

```bash
claude /login    # once, in a terminal
```

**Option B — Anthropic API:** set `llm.provider: "anthropic"` in `src/config.ts` and export `ANTHROPIC_API_KEY`.

### 2 · Cover generation keys (do this during onboarding)

**The cover is what makes each issue feel alive — set this up.** A fresh clone ships with a bundled default cover (`assets/cover-default.jpg`, the inaugural issue's art) so you're never cover-less, but **every issue would reuse that same image**. To get a *unique* cover generated from each week's actual reading, you need two keys:

- **An LLM** (the *art director*) — the Claude Code CLI or Anthropic API you already set up in step 1. It reads the week's topics and designs one visual metaphor + an image prompt.
- **An OpenAI key** (the *renderer*) — turns that prompt into the finished illustration via `gpt-image-1`.

Without the OpenAI key, Browstack falls back to having your **subscription LLM draw the cover itself as an SVG illustration** (strongest model, high reasoning effort) — every issue still gets a unique cover. The OpenAI renderer simply produces richer raster art. The bundled default cover is only the last resort.

At [platform.openai.com](https://platform.openai.com) create a **dedicated project + key with a monthly spending cap** (one image per week costs very little — a $10 cap is generous). Then store it in the Keychain — note the **leading space** which keeps the command out of your shell history:

```bash
 security add-generic-password -s browstack-openai -a "$USER" -w '<your-key>' -U
```

`npm run cover` finds it automatically (env var `OPENAI_API_KEY` takes precedence if set). Never put keys in `~/.zshrc` — plaintext on disk, inherited by every process, and dotfile syncing is the classic leak path.

### 3 · Gmail SMTP for delivery (macOS Keychain)

You only do this once:

1. [Google Account → Security → 2-Step Verification → App passwords](https://myaccount.google.com/apppasswords) — generate one (name it anything, e.g. `browstack`).
2. In a terminal (note the leading space):

```bash
 security add-generic-password -s browstack-smtp -a you@example.com -w '<16-char app password>' -U
```

3. `npm run send` — issue №0 arrives in your inbox, cover inlined at the top. (Email clients reject `data:` URI images but accept CID attachments, which is what Browstack uses.)

### 4 · Weekly automation (launchd)

One command schedules the full run — `ingest → enrich → cover → send` — as a macOS LaunchAgent:

```bash
npm run schedule:weekly                        # every Saturday 08:17 by default
npm run schedule:weekly -- --day 1 --hour 9    # e.g. Mondays at 09:00 (--day 0–6, 0 = Sunday)
```

- Runs in your logged-in user session, so the Keychain (LLM/OpenAI/SMTP secrets) is available.
- If your Mac is asleep at the scheduled time, launchd runs the job on next wake.
- A failed cover render (e.g. missing OpenAI key) doesn't block the issue — the previous cover is reused.
- A transient LLM failure doesn't kill the run either: classification retries once, and the issue ships with whatever was already enriched. An empty issue is never sent.
- The schedule fires twice each Saturday (08:17 primary, 20:17 retry); once an issue has shipped, the retry is an automatic no-op. A fatal failure raises a macOS notification instead of failing silently.
- A daily credential heartbeat (09:37) keeps the Claude CLI session fresh and notifies you days ahead if `claude /login` is needed again.
- Built-in quality guards: extraction stubs (< 300 chars) and duplicate social posts are auto-demoted; encyclopedia/dictionary lookups never qualify.
- Logs: `data/logs/weekly.log`. Manual run anytime: `npm run weekly`.
- Uninstall: `launchctl bootout gui/$UID/com.browstack.weekly && rm ~/Library/LaunchAgents/com.browstack.weekly.plist`

### Issues & archive

Every issue is numbered and kept: №0 is the preview issue; every issue after it is simply №N — progression is carried by the number itself. A successful `send` seals the current issue; the next run automatically opens a new one with a fresh cover. Artifacts accumulate under `out/` (web + email versions per issue) and `assets/covers/` (one cover per issue), with a browsable archive at `out/index.html`. If a week's cover fails to render, the previous issue's cover is reused.

## Editorial principles

- **Knowledge is a hard gate.** Entertainment gossip, lotteries, shopping promos, event signups and dictionary-style quick lookups are excluded regardless of dwell time.
- **Summaries must replace the original.** Three bullets ≤ 42 chars + one takeaway ≤ 32 chars per article.
- **The issue is an artifact.** Fixed palette, serif nameplate, issue numbering — beauty gets it opened, content quality gets it finished.

## Roadmap

- Scoring v2: active-reading signals into ranking; topic normalization
- Curation UI: pick items, add your own takes, publish selected content outward
- Publishing targets: own list via SMTP/SendGrid, Ghost/Buttondown export

## License

[MIT](LICENSE)
