# Laconia

Makes Claude Code write like a person instead of producing a report.

Named for the region of Sparta. Philip II wrote to the Spartans: *"If I enter
Laconia, I will raze Sparta to the ground."* They replied with one word: *"If."*

## Why it exists

Measured on 2026-08-21 across 206 Claude Code transcripts on this machine,
1,199 turn-ending answers:

| | |
|---|---|
| median answer | 311 words |
| em dashes per answer | 5.98, in 90.4% of answers |
| bold spans per answer | 6.07 |
| bullets opening with a bold phrase | 40.0% |
| answers scoring clean | 9.1% |

The slop was almost entirely **structural**, not vocabulary. "Delve" and
"tapestry" barely registered. It was punctuation, emphasis and layout.

Marko had already asked for shorter replies, and a rule was already written down
on 7 Aug. It moved the median from 394 to 296 words and then plateaued. A harder
case is on file: "research in a browser, never WebFetch" has now been given six
separate times, sits in the memory index, and was still broken in the first tool
call of the session where this plugin was designed.

So: **prose for judgment, machinery for reflexes.**

## The four layers

1. `output-styles/laconia.md` is the voice contract. An output style is the
   only mechanism that puts rules in the system prompt itself and gets
   re-injected as reminders through the conversation. `force-for-plugin: true`,
   so it applies whenever the plugin is enabled, and
   `keep-coding-instructions: true`, so engineering behaviour is untouched.

2. `bin/laconia-lint.mjs` is a deterministic linter, zero dependencies. Also a
   CLI: run it on any draft before it is sent. Fenced code, inline code, link
   targets and blockquotes are masked, so a quoted em dash is not a violation.

3. `scripts/stop-gate.mjs` is a Stop hook. It lints the reply about to end the
   turn and, on a hard violation, returns `decision: "block"` with the exact
   list, which the model receives as its next instruction and rewrites from.
   Guarded by `stop_hook_active` and a circuit breaker that downgrades to
   advisory after 5 blocks in one session.

   `scripts/browser-first.mjs` is a PreToolUse hook that denies `WebFetch` and
   `WebSearch`, naming Playwright in the refusal. The thesis in one rule.

4. `bin/laconia-report.mjs` and the `/laconia` skill: every scored reply
   appends to `~/.claude/laconia/ledger.jsonl`, so "did this work" has an answer
   with numbers rather than a feeling.

## Use

```bash
node ~/.claude/skills/laconia/bin/laconia-report.mjs 7      # trend, last 7 days
node ~/.claude/skills/laconia/bin/laconia-lint.mjs --file draft.md
```

Or just ask: `/laconia`.

## Which agents this covers

One repo, one voice contract, one linter, one ledger. `install.mjs` wires it into
whatever is on the machine and resolves absolute paths for that machine, which is
what lets the same checkout serve Windows and macOS.

```bash
node install.mjs            # install or repair, idempotent
node install.mjs --check    # report what is wired, change nothing
node install.mjs --uninstall
```

Claude Code needs no install step. This directory sitting at
`~/.claude/skills/laconia` is the install, and it loads as `laconia@skills-dir`.

Codex gets the same treatment through its own surfaces. The voice contract goes
into `~/.codex/AGENTS.md` as a managed block between markers, so re-running the
installer updates it without touching anything else in that file. The Stop gate
goes into `~/.codex/hooks.json`. Codex's `Stop` hook has the same
block-and-rewrite contract as Claude Code's: `decision: "block"` with a reason
turns into a continuation prompt. Verified end to end, first attempt blocked on
an em dash and the second came back clean.

Two Codex caveats. Codex will not run a new hook until you trust it, so open
Codex, run `/hooks`, and trust the Laconia entry once. And Codex's web search is
a hosted tool that hooks cannot intercept, so there the browser-first rule is
carried by instructions only, not enforced.

Not covered, deliberately: Claude Code subagents run their own system prompt;
Athena's in-house agent is a separate system where ADR-050 already covers this;
opencode is installed but unwired.

## Second machine

The repo is the unit. On the MacBook:

```bash
git clone <remote> ~/.claude/skills/laconia
cd ~/.claude/skills/laconia && node install.mjs
```

`install.mjs` writes macOS paths into the Codex config, so nothing needs editing
by hand. Updating later is `git pull && node install.mjs`. The ledger stays
per-machine on purpose, since it measures that machine's sessions.

## Tuning and off switches

Everything lives in `laconia.config.json` and is re-read every turn, so no
restart is needed. `mode` is `block`, `advisory` or `off`.

Disable the whole plugin: `claude plugin disable laconia@skills-dir`.
Remove it: delete this directory.

## Known limits

- Output styles apply to the main conversation only. A subagent runs its own
  system prompt, so spawned agents still write long. Their output is relayed,
  not read directly.
- `force-for-plugin` overrides the `outputStyle` setting, so the `/config`
  picker will not appear to take effect while this plugin is enabled. That is
  deliberate: a voice rule that can be forgotten is the thing that failed.
- A hard em-dash ban has a real cost. Em dashes are good punctuation. The ban
  exists because the frequency is the tell and only a hard rule is enforceable.
- `MessageDisplay` was considered for stripping tells at render time and
  rejected: it is display-only, so it would clean the screen while leaving the
  transcript, the habit and every written deliverable untouched.
