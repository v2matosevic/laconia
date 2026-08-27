---
name: laconia
description: Report on, tune, or apply Laconia, the writing-voice system that keeps agent replies short and human. Use when asked how the voice plugin is doing or whether it is working, to see the slop trend, ledger or audit, to lint a draft before it is sent (email, offer, PDF copy, commit message, docs, release notes), to loosen or tighten the rules, to turn blocking on or off, or when the user complains again that a reply was too long, too formal, too technical, or read like AI slop.
---

# Laconia

A voice system in four layers. The voice contract is always on; this skill is the
console for the rest.

Package root: wherever this skill is loaded from.
User settings: `~/.laconia/config.json`, re-read every turn, no restart.
Ledger: `~/.laconia/ledger.jsonl`.

## Is it working?

```bash
npx laconia report          # all time
npx laconia report 7        # last 7 days
```

It compares against the user's own earliest replies, not a stranger's numbers.
Report the two or three that moved. Do not paste the whole table.

If the gate is firing on more than about a quarter of replies after the first few
days, the voice contract is not landing. That is the thing to fix, not the
threshold. Check the sessions were restarted after install.

For a baseline over the whole transcript archive rather than the ledger:

```bash
npx laconia audit
```

## Lint something before it goes out

This matters more than the chat rules. The gate covers replies; most slop
complaints are about things the user sends other people.

```bash
npx laconia lint draft.md
npx laconia lint draft.md --json
cat draft.md | npx laconia lint
```

Exit 1 means at least one hard violation. Fenced code, inline code, link targets
and blockquotes are masked, so a quoted em dash is not a violation. To document
bad writing deliberately, wrap it in `<!-- laconia-disable -->` and
`<!-- laconia-enable -->`.

Fix what it finds, then re-run. Never hand over a draft that still fails.

## Tune it

Edit `~/.laconia/config.json`:

- `mode`: `block` makes the model send a corrected reply after a violating one,
  `advisory` only logs, `off` disables the gate. The voice contract stays on in
  all three. Read the next section before choosing.
- `blockRules`: only mechanically unambiguous rules belong here. Judgment rules
  stay advisory by design.
- `circuitBreaker.maxBlocksPerSession`: after this many blocks in one session
  Laconia downgrades itself to advisory and says so once.
- `lint.wordBudget`: soft target for a normal reply. `wordBudgetDepth` applies
  when the last user message asked for depth.
- `browserFirst.enabled`: off by default. Denies WebFetch and WebSearch and
  points at a real browser instead. Claude Code only.

Personal preferences go in `~/.laconia/voice.local.md`, then re-run
`npx laconia install`. That file is appended to the contract for every agent and
is the right place for who is reading, vocabulary to avoid, or a language other
than English.

Turn everything off with `npx laconia uninstall`.

## Which mode, and what block cannot do

`block` does **not** hide the violating reply in a client that streams tokens to
the screen as they arrive. Claude Code's terminal streams. A Stop hook cannot
fire until the reply is finished, and by then it is rendered with no API to
retract it, so the correction arrives as a second message beneath the first. The
final word is clean; the reader saw both. Only a client that buffers a whole
reply before displaying it makes `block` a true suppression.

This was documented the other way round until 2026-08-27, so a user who reads
the old wording and then watches a reply appear anyway concludes the gate is
broken. It is not. It is doing the only thing a Stop hook can do.

Choose on what you actually want. Use `block` when the final answer has to be
clean, because it gets copied somewhere, pasted to a client, or read by another
tool, and you accept reading a violating turn twice. Use `advisory` when you want
to read each reply exactly once; violations are still logged, so `report` and
`audit` are unaffected.

If someone complains about seeing double, the honest answer is that the gate
cannot prevent it, and the real fix is the violation rate. On one measured week:
549 replies, 95 blocked, **90 of the 95 on em dashes alone**. When a single rule
is that dominant, tightening the contract beats tuning the gate, and blocking is
already a backstop rather than the mechanism.

A useful middle setting is `circuitBreaker.maxBlocksPerSession: 1` or `2`, which
caps how many times per session a reader can be shown the same turn twice.

## When they complain about a reply again

Apologising and shortening the next one is not the fix. That is what fails.

1. Lint the offending reply. If it passed clean, the rule set has a gap. Work out
   which tell it missed and add it, with a test.
2. If it failed and was not blocked, check `mode` and the circuit breaker.
3. If the miss is judgment rather than mechanics, the fix belongs in the voice
   contract or `voice.local.md`, not in a new rule.
4. Before shipping a new rule, replay it over the real transcript archive with
   `npx laconia audit`. A rule that has not been replayed is a guess.

## Rules currently enforced

Hard, blocked: `em-dash`, `inline-header-bullet`, `emoji`.

Soft, logged: `bold-density`, `header-in-short-reply`, `table`,
`horizontal-rule`, `negative-parallelism`, `trailing-offer`, `hedge`,
`ai-vocab`, `length`.
