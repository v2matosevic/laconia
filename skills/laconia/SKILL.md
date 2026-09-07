---
name: laconia
description: Inspect or tune Laconia voice rules, audit its reply ledger, or lint a draft. Use for voice-system work or recurring style complaints.
---

# Laconia

Use this skill to inspect or adjust the writing system. The voice preferences
are separate and apply during normal work; this skill does not require an audit
for every reply.

The package root is two directories above this file. Run the local CLI with
`node <package-root>/bin/laconia.mjs`; do not assume an npm release exists.
Personal settings and the local ledger live in `~/.laconia`.

## Inspect

Run `check` to inspect wiring and config diagnostics. A configured hook is not
proof of trust or execution. Native Codex hooks require review when their
definition changes. Restart sessions after changing a voice contract.

Run `report 7` for recent results, or `report 7 --json` for data. Compare each
agent and request class separately. Scores describe mechanical style, not
accuracy or naturalness. Legacy or mismatched contract versions are not a
controlled baseline. Run `audit --max-mb 100` only when transcript review is
needed; it reads local history and never uploads it.

## Check a draft

Run `lint draft.md --format document`, optionally with `--json`. Ordinary chat
uses `--format chat`; `--depth` allows its longer budget. JSON and explicitly
structured output are preserved. Code, quotes and literal content are exempt.
Use `<!-- laconia-disable -->` through `<!-- laconia-enable -->` for deliberate
examples. Exit 1 means a mechanical preference failed, not that the text is
incorrect. Preserve an explicit user request over a style rule.

Fix applicable findings, then rerun. Do not alter quotations, code, required
formats, approvals or factual meaning just to make the checker pass.

## Tune

Change `~/.laconia/config.json`, then run `check`. Settings are re-read by hooks.
`mode: advisory` records findings without requesting another reply; `block`
requests a correction which may appear after the original streamed reply.
`off` disables the Stop checker only; the voice remains installed.
`blockRules` chooses blocking preferences. `lint.disabledRules` disables a rule
entirely. Invalid settings degrade to advisory with browser restrictions off.

Personal voice belongs in `~/.laconia/voice.local.md`. Claude reads it through a
SessionStart hook; Codex's CLI installation needs `install --agent codex` to
refresh its AGENTS block. The native Codex plugin reads it at SessionStart.
Use one Codex installation route, then start a new session. No permission,
model, sandbox or shell settings need to change.

## When a reply misses

Correct the current reply first. Investigate the voice system when the user
asks to tune it or the complaint is recurring; a one-off correction does not
require a plugin code change, new global rule or transcript audit.

A clean lint result may reflect a judgment preference rather than a missing
mechanical rule. Put judgment in the voice contract or personal additions.
Add a mechanical rule only for a demonstrated recurring pattern, with tests
and a bounded replay over representative local replies. Preserve useful detail
and exact meaning. Evaluate the revised voice on the same requests in both
agents; a shorter answer is not automatically better.
