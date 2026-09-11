---
name: lstep-analysis
description: "Use when the user wants to analyze LSTEP (Lステップ) LINE-marketing CRM data — customer lists, cancellation/loss reasons, LINE conversation transcripts, or conversion funnel analysis."
---

# LSTEP分析 (LSTEP Analysis)

A repeatable workflow for analyzing LSTEP (Lステップ) LINE CRM data for a business (e.g. a study-abroad company): investigating why leads cancelled, went silent, or lost to a competitor, by reading their actual LINE conversation history and cross-referencing it against a customer list (often a Google Sheet).

## Critical security rule: LSTEP_TOKEN never touches chat

The LSTEP API token must **never** be typed into the chat conversation, ever, under any circumstances — not even partially, not even redacted. It stays only in the user's own local terminal as an environment variable.

- Python scripts read it via `TOKEN = os.environ.get("LSTEP_TOKEN")` — **stdlib only, no pip installs** (the user runs this locally, so don't assume they have packages installed; use `urllib.request` not `requests`).
- Claude writes and delivers the *script* (via SendUserFile); the user runs it locally with `export LSTEP_TOKEN="..."` in their own terminal and uploads only the **resulting JSON output file** back to the chat — never the token itself, never raw API responses containing auth headers.
- If a token is ever accidentally exposed in a screenshot or message the user sends, do not make a scene about it or repeatedly urge rotation — note it once if truly the first time, then respect the user's judgment. If they've already decided not to rotate a previously-exposed token, don't re-raise it.
- Raw message text extracted from the API must be redacted for email addresses and phone numbers before being written to any file (regex: `EMAIL_RE = r"[\w.+-]+@[\w-]+\.[\w.-]+"`, `PHONE_RE = r"0\d{1,3}[-(（]?\d{2,4}[-)）]?\d{3,4}"`). Customer *names* generally do NOT need redaction in internal investigative files the user (who already has the names) will read — only in anything meant for wider/external sharing.

## Helping the user run a local script (troubleshooting downloads/terminal)

When there's no device-bridge connection to the user's computer, delivering a script via SendUserFile and getting the output back is a multi-turn, often fiddly process. Expect and patiently walk through:

- Give **concrete, copy-pasteable commands** — never a placeholder like `cd <path>` for the user to fill in; if you don't know their exact path, ask them to run `pwd` first or guess a sensible default (e.g. `~/Desktop/<folder-name>` if that's been used before in the conversation) and give a fallback `find ~ -iname "<filename>"` to locate it.
- A common failure mode: the file downloaded to `~/Downloads` but the user is working in a different folder. Diagnose with `ls -lt ~/Downloads | head -20` or `find ~ -iname "<filename>" 2>/dev/null`, then `mv ~/Downloads/<file> .` (from the target folder) or `mv ~/Downloads/<file> ~/target/folder/`.
- If terminal output looks like several commands are typed but not executed (no shell prompt between them, cursor just sitting there), the user likely pasted multi-line text that hasn't been submitted — tell them to click into the terminal and press Enter once.
- `LSTEP_TOKEN` must be re-exported in every new terminal window/tab (env vars don't persist across terminal sessions) — this is a frequent "it says token not set" cause after troubleshooting steps that involved opening a fresh terminal.
- Resend the file (call SendUserFile again) if the user reports it's simply not showing up anywhere — downloads sometimes silently fail.

## The two-phase pattern

**Phase 1 — identify the customer list.** This might be a list the user pastes, an uploaded file, or a Google Sheet (search Google Drive by title if the user names one, e.g. `mcp__Google_Drive__search_files`). If pulling from Google Sheets via `download_file_content` with `exportMimeType: "text/csv"`, note the returned `content` field is **base64-encoded** — decode it before parsing as CSV. Watch for encoding corruption on very long base64 strings copied through chat/shell — verify with `data.decode('utf-8')` in a try/except and patch any single-byte corruption found (compare against context to infer the correct byte) rather than assuming the whole payload is bad.

**Phase 2 — generate a friend-search + transcript-extraction script.** Build a Python script (stdlib only) that:
1. Takes a `TARGET_NAMES` list (or `TARGET_INFO` dict with per-customer reference metadata from the sheet: counselor, status, loss_reason, dates, etc.)
2. Calls `GET /v2/api/friends` (paginated via `cursor`, filtered by `created_at_from`) to find friends whose `name`/`full_name`/`system_name` match a target name after whitespace normalization (strip spaces including full-width `　`; for names with parenthetical annotations like "宇山優吾(母)", strip the `(...)`/`（...）` suffix before searching)
3. For each uniquely-resolved friend, extracts their full message history (prefer local cached JSON files if the user has them from prior sessions; otherwise fetch directly via `GET /v2/api/messages` with `direction`/`friend_id` filters)
4. Merges outbound+inbound, sorts by `sent_at`, redacts email/phone, and writes one JSON file with per-customer transcripts plus ambiguous-match / zero-match diagnostics
5. When exactly 2 candidates match a name, resolve the ambiguity by comparing the sheet's `registration_date` against each candidate's `created_at`

Always smoke-test the generated script before sending it: `python3 -m py_compile`, and a monkeypatched dry-run (fake `fetch()` returning canned data) exercising the full `main()` path to catch schema/logic bugs before the user burns a round-trip running it for real. Common gotcha: f-strings cannot contain backslash-escaped quotes (`f"{d[\"key\"]}"` is a SyntaxError) — use single quotes inside the expression or a pre-computed variable instead. Another: don't `json.dumps()` a dict containing `None`/`True`/`False` and then `exec()` it as a Python literal — those become invalid `null`/`true`/`false`; use `pprint.pformat()` for a Python-literal dump instead.

## Analyzing the transcripts (once uploaded back)

For anything beyond a handful of customers, **fan out to parallel subagents** rather than reading every transcript yourself:

1. Split customers into balanced groups (~10-13 per group keeps each agent's context reasonable; scale group count to total N)
2. Write one input JSON file per group (customer name + any sheet reference fields + full transcript)
3. Launch one Agent per group in a single message (true parallelism), each given: the input file path, a precise output schema (exact field names, allowed enum values, evidence-quote requirements), and an explicit output file path to `Write` to
4. Instruct agents to ground every judgment in verbatim quotes, rate their own confidence, and flag when the transcript's evidence contradicts or is more nuanced than any pre-existing status label (e.g. a CRM's own recorded "loss reason") — this consistently surfaces real, actionable data-quality findings (stale statuses, wrong competitor names, un-updated records) worth its own report section
5. Merge all group outputs in Python, and **validate**: exact name-set equality against the master list, and expected entry counts per group, before computing any aggregate statistics
6. For follow-up requests that need *additional* fields on the *same* customers already analyzed (e.g. "now also tell me about X"), **resume the same subagents via SendMessage** (using the `agentId` returned by the original Agent call) rather than relaunching fresh agents — they still have the transcripts in context, saving a full re-read. Ask only for the new fields, explicitly say not to re-derive the old ones.

Compute anything that's a deterministic derivation (date math for lead time / silence gaps, follow-up message counts after a customer's last reply, median/distribution stats) directly in Python from the raw transcript JSON — don't delegate arithmetic to agents. Reserve agent time for judgment calls that require reading and understanding prose.

## Building the HTML report

Deliver findings as a single self-contained HTML file (never as a separate framework/build step) using a consistent `.viz-root` design system: CSS custom properties for light/dark themes (`@media (prefers-color-scheme: dark)` guarded by `:root:where(:not([data-theme="light"]))`, plus a `:root[data-theme="dark"]` override block for an explicit in-app toggle), `.card` sections, `.stat-grid`/`.stat-tile` for headline numbers, `.callout`/`.callout.warn`/`.callout.crit` for narrative interpretation, a filterable/searchable `table.roster` with expandable `.detail-row` per record (click toggles `.open` on both rows), and `.cmp-bar-track`/`.cmp-bar-fill` two-series horizontal bars for group-vs-group comparisons. Embed data as `const NAME = {...json...};` blocks and render via plain JS — no external libraries needed. When updating a report with a new round of findings, regenerate the whole file fresh from a Python template (safer than hand-patching a 100+KB file) rather than trying to surgically inject into an existing large HTML.

**Before delivering, always verify with Playwright**: headless Chromium at `/opt/pw-browsers/chromium`, load the file in both `color_scheme='light'` and `'dark'`, assert zero `console` errors and zero `pageerror` events, exercise the interactive bits (click filters, expand a detail row, confirm row counts match expectations), and take a full-page screenshot to visually sanity-check before sending. Delete temp screenshot/verification scripts afterward.

**Delivery**: unless explicitly told otherwise, treat this as sensitive internal business data — deliver only via `SendUserFile` (never the `Artifact` publish tool, which would put it on a shareable hosted URL). If the user has previously said something like "ローカルのみで見れるように" ("keep it viewable locally only"), that instruction persists for the rest of the project — don't re-ask.

## Iterating on follow-up requests

Users frequently escalate the analysis across several turns within one project (e.g.: "also check if they rebooked" → "now classify by reply/no-reply and tabulate reasons" → "now do this for a different customer list" → "now break it down by staff member, add lead-time/meeting-count/competitor-retention-talk analysis"). Each round typically: (a) adds new extracted fields without discarding prior ones, (b) regenerates the HTML report fresh with new cards/sections, (c) re-verifies with Playwright, (d) redelivers via SendUserFile. Keep every prior round's JSON outputs on disk so later rounds can merge against them rather than re-deriving from scratch. If a user's own preference (e.g. "don't ask clarifying questions, just proceed" or "keep this local-only") was established earlier in the project, keep honoring it silently rather than re-confirming each round.