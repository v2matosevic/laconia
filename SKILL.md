---
name: laconia
description: Report on, tune, or apply Laconia, the writing-voice system that keeps Claude Code's replies short and human. Use when Marko asks how the voice/output plugin is doing, whether it is working, to see the slop trend or ledger, to lint a file or a draft before it is sent (email, offer, PDF copy, WhatsApp, commit message, docs), to loosen or tighten the rules, to turn blocking on or off, or when he complains again that a reply is too long, too formal, too technical or reads like AI slop.
---

# Laconia

A voice system in four layers. Layer 1 is the output style and is always on;
this skill is the console for the rest.

Plugin root: `~/.claude/skills/laconia/`
Config: `laconia.config.json` (re-read every turn, no restart)
Ledger: `~/.claude/laconia/ledger.jsonl`

## Is it working?

```bash
node ~/.claude/skills/laconia/bin/laconia-report.mjs        # all time
node ~/.claude/skills/laconia/bin/laconia-report.mjs 7      # last 7 days
```

Every column is compared against the baseline measured on 2026-08-21 over 1,199
turn-ending answers, before any of this existed:

| | baseline |
|---|---|
| median words | 311 |
| mean slop score | 40.7 |
| clean replies | 9.1% |
| replies with an em dash | 90.4% |
| replies over bold budget | 64.6% |
| bold-headed bullets | 40.0% |

Report the two or three numbers that moved. Do not paste the whole table at him.

If the gate is firing on more than about a quarter of replies after the first
few days, the output style is not landing and that is the thing to fix, not the
threshold.

## Lint something before it goes out

This matters more than the chat rules: his loudest slop complaints are about
deliverables, not replies. Client emails, the ponuda, PDF copy, WhatsApp
messages, Croatian text.

```bash
node ~/.claude/skills/laconia/bin/laconia-lint.mjs --file draft.md
node ~/.claude/skills/laconia/bin/laconia-lint.mjs --file draft.md --json
cat draft.md | node ~/.claude/skills/laconia/bin/laconia-lint.mjs --stdin
```

Exit 1 means at least one hard violation. Fenced code, inline code, link targets
and blockquotes are masked, so a quoted em dash or one inside a code sample is
not a violation.

Fix what it finds, then re-run it. Do not hand him a draft that still fails.

## Tune it

Edit `laconia.config.json`. The fields that matter:

- `mode`: `block` rewrites a violating reply before he sees it, `advisory`
  only logs, `off` disables the gate. The output style stays on in all three.
- `blockRules`: only mechanically unambiguous rules belong here. Judgment
  rules stay advisory by design.
- `circuitBreaker.maxBlocksPerSession`: after this many blocks in one session
  Laconia downgrades itself to advisory and says so once.
- `lint.wordBudget`: soft target for a normal reply. `wordBudgetDepth` applies
  when the last thing he said asked for depth.
- `browserFirst.denyWebFetch`: denies WebFetch and points at Playwright.

To turn the whole thing off: `claude plugin disable laconia@skills-dir`.

## When he complains about a reply again

Apologising and shortening the next one is not the fix. That is what failed for the
five months this plugin exists to fix.

1. Lint the offending reply. If it passed clean, the rule set has a gap: work
   out which tell it missed and add it to `bin/laconia-lint.mjs`.
2. If it failed and was not blocked, check `mode` and the circuit breaker.
3. If the miss is judgment rather than mechanics, the fix belongs in
   `output-styles/laconia.md`, not in a new rule.
4. Record what he actually said, verbatim and dated, in the global memory vault.
   The quotes are the evidence base this was built from.

## Rules currently enforced

Hard, blocked: `em-dash`, `inline-header-bullet`, `emoji`.
Soft, logged: `bold-density`, `header-in-short-reply`, `table`,
`horizontal-rule`, `negative-parallelism`, `trailing-offer`, `hedge`,
`ai-vocab`, `length`.
