<div align="center">

# Laconia

**Makes your coding agent write like a person.**

[![npm](https://img.shields.io/npm/v/laconia?color=%23c42b31)](https://www.npmjs.com/package/laconia)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

Works with **Claude Code** and **Codex**.

</div>

---

Philip II of Macedon wrote to Sparta: *"If I enter Laconia, I will raze Sparta to
the ground."*

The Spartans replied with one word. *"If."*

---

## See it first

Before you install anything, look at what your agent has actually been sending you.

```bash
npx laconia audit
```

It reads the transcripts already on your disk, finds the messages that ended a
turn (the ones you actually read), and scores them. Local file reads and regexes.
Nothing is uploaded, no model is called, no network request is made.

```
  Claude Code  1199 replies from 206 of 500 transcripts, 900 MB

  Your turn-ending replies  n=1199

    median words                    311   ████████████████░░░░  ref 311
    replies with an em dash       90.4%   ██████████████████░░  ref 90.4%
    bold-headed bullets           40.0%   ████████░░░░░░░░░░░░  ref 40%
    clean replies                  9.1%   ██░░░░░░░░░░░░░░░░░░  ref 9.1%

    longest reply 1740 words   over 250 words 62%   em dashes per reply 6.0

  Where the slop is

    em dash                      90.4%  ██████████████████████░░
    bold over budget             64.6%  ████████████████░░░░░░░░
    bold-headed bullet           40.0%  ██████████░░░░░░░░░░░░░░
    table in a reply             16.3%  ████░░░░░░░░░░░░░░░░░░░░
    trailing offer               10.3%  ██░░░░░░░░░░░░░░░░░░░░░░

  That is a lot of words nobody asked for.  Fix it: npx laconia install
```

Those are real numbers from one developer's archive. Yours will be your own.

## What changes

Same facts, same thoroughness, same engineering. Only the message changes.

<table>
<tr><th width="50%">Before, 170 words</th><th width="50%">After, 58 words</th></tr>
<tr valign="top"><td>

<!-- laconia-disable: this column is a deliberate example of what not to write -->

**v1.3.0 is publicly released and fully verified.**

- **[v1.3.0](#)** is live and marked *Latest* — "88% smaller, races fixed" with `Setup-1.3.0.exe` (58MB, down from 484MB) attached.
- **cuda-pack-cu13** is live as a separate, non-latest, version-independent release. I HEAD-checked the *exact* URL: HTTP 200, full 448MB — the in-app button works from day one.
- **version.json pushed** and the raw endpoint verified — every existing install's update checker will surface the new version.

Release order was deliberate: pack first, then the app, then the update-checker flip — so no user could be notified into a broken download.

<!-- laconia-enable -->

</td><td>

v1.3.0 is out and working.

The installer dropped from 484MB to 58MB because the CUDA pack is a separate download now. I checked that download link myself: 200, full 448MB. Existing installs will see the update.

I shipped the pack before the app on purpose, so nobody could get notified into a broken download.

</td></tr>
</table>

## Install

**Claude Code**, from inside a session:

```
/plugin marketplace add v2matosevic/laconia
/plugin install laconia@laconia
```

**Codex, or both at once**, from a terminal:

```bash
npx laconia install
```

That copies the plugin into `~/.claude/skills/laconia`, writes the voice contract
into `~/.codex/AGENTS.md`, and wires the gate into `~/.codex/hooks.json`. It skips
whatever is not installed and it is safe to re-run.

Then restart your sessions. Hooks and system prompts are read at session start.

One manual step if you use Codex: it will not run a new hook until you trust it.
Open Codex, run `/hooks`, trust the Laconia entry. Once per machine.

## How it works

Four layers, each doing the job the one above it cannot.

**The voice contract** is an output style, which is the only mechanism that puts
rules in the system prompt itself and gets re-injected as reminders through the
conversation. It keeps your agent's coding instructions untouched and governs
only what it says about the work.

**The linter** is deterministic and has no dependencies. Given text it returns
violations with line numbers and a score. Code fences, inline code, link targets
and blockquotes are masked, so a quoted em dash is not a violation.

**The gate** is a `Stop` hook. It lints the reply about to end the turn and, on a
hard violation, hands the model the exact list to rewrite from. You never see the
first draft. Claude Code and Codex happen to share this contract, so one script
serves both.

**The ledger** is one JSONL line per reply at `~/.laconia/ledger.jsonl`. Local
only. `laconia report` tells you whether any of this actually worked, comparing
against your own first week rather than someone else's numbers.

## Use it on things you send people

The gate covers chat. The linter covers everything else, and that is often where
it matters more.

```bash
npx laconia lint offer.md          # exits 1 on a hard violation
npx laconia lint --text "..."
cat draft.md | npx laconia lint
git diff | npx laconia lint        # commit messages, PR bodies
```

## The rules

Three are blocked because they are mechanical and cannot produce a false positive
once code and quotes are masked.

| Rule | Why |
|---|---|
| `em-dash` | The single most recognisable mark of generated text. A 2026 study found Claude is the only current model that uses them more than professional writers do. |
| `inline-header-bullet` | A list item opening with a bold span, `- **Thing:** description`. The most recognisable *shape* of generated text. |
| `emoji` | Check marks and warning signs as status markers. |

The rest are logged, not blocked, because they need judgment a regex does not
have: `bold-density`, `header-in-short-reply`, `table`, `horizontal-rule`,
`negative-parallelism`, `trailing-offer`, `hedge`, `ai-vocab`, `length`.

Rule catalogue adapted from [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing),
the best field guide to these markers that exists.

## Configure

Everything lives in `~/.laconia/config.json` and is re-read every turn, so edits
take effect without a restart.

```jsonc
{
  "mode": "block",          // "advisory" to log only, "off" to disable the gate
  "blockRules": ["em-dash", "inline-header-bullet", "emoji"],
  "circuitBreaker": { "maxBlocksPerSession": 5 },
  "lint": { "wordBudget": 150, "wordBudgetDepth": 600 }
}
```

Write anything personal into `~/.laconia/voice.local.md` and re-run
`npx laconia install`. It is appended to the contract for every agent. Use it for
who is reading, vocabulary you cannot stand, a language other than English, or the
one thing you keep having to say twice.

Nothing you own lives inside the package, so an update never overwrites your
settings, your personal additions, or your ledger.

## Why it exists

The rules were not guessed. They came out of measuring 1,199 turn-ending answers
across 206 transcripts.

The finding that shaped the design: the slop was almost entirely **structural**.
Punctuation, emphasis, layout. The vocabulary tells barely registered, under 5%.
"Delve" and "tapestry" are not the problem any more. Structure is, and structure
is exactly what a machine can check and a prompt cannot reliably fix.

The second finding is why the gate exists at all. A written rule asking for
shorter replies moved the median from 394 to 296 words and then plateaued, still
well over target. In the same archive, an instruction to use a browser instead of
a fetch tool had been given **six separate times**, was sitting in the agent's own
memory index, and was still broken in the first tool call of the session where
this was designed.

So: **prose for judgment, machinery for reflexes.** Anything mechanically
checkable should be mechanically checked, not politely requested.

## Honest limits

The em-dash ban has a real cost. Em dashes are good punctuation. The ban exists
because frequency is the tell and only a hard rule is enforceable. One line of
config turns it off.

Output styles apply to the main conversation only, so Claude Code subagents run
their own system prompt and still write long.

Codex's web search is a hosted tool that hooks cannot intercept, so the optional
browser-first rule is Claude Code only.

The gate costs one extra model turn each time it fires. If it fires on more than
about a quarter of your replies after the first few days, the voice contract is
not landing, and that is the thing to fix rather than the threshold.

`laconia audit` reads your transcripts. That is your session history, so read
`lib/audit.mjs` before you run it if that matters to you. It is about 130 lines
and makes no network calls.

## Uninstall

```bash
npx laconia uninstall              # or /plugin uninstall laconia@laconia
```

Your config and ledger in `~/.laconia` are left alone.

## Contributing

New rules are welcome, with one condition: replay the rule over a real transcript
corpus before proposing it. The first emoji rule here flagged 41.8% of a real
archive, and 166 of roughly 200 hits were a plain right arrow used as ordinary
technical punctuation. A rule that has not been replayed is a guess.

```bash
npm test
```

27 tests. CI runs them on Linux, macOS and Windows across Node 18, 20 and 22,
and asserts that the docs pass their own linter, because a tool that cannot keep
its own README clean has no business shipping.

This README passes its own linter. So does the skill file and the voice contract.

## License

MIT
