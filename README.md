# Laconia

Clear, natural replies from Claude Code and Codex, with local style checks.

Laconia helps an agent answer the actual question, report the true delivery
state, and keep useful detail. It preserves the agent's coding instructions,
permission boundaries and requested output formats. A short answer still needs
to be a complete answer.

## Install from GitHub

Requires Node.js 18 or newer. There is no npm release at the time of this
release, so use the checkout's CLI rather than `npx laconia`.

```sh
git clone https://github.com/v2matosevic/laconia.git
cd laconia
node bin/laconia.mjs install
node bin/laconia.mjs check
```

The installer supports `--agent claude`, `--agent codex`, or both by default.
It preserves unrelated agent settings and instructions, makes backups before
shared-file edits, and can be run again. It does not change models, permissions,
sandbox settings, hook trust, PATH or shell configuration.

Start a new session after installing. In Codex, use `/hooks` to review any new
or changed Laconia hook definition. Configuration presence does not prove that
a hook is trusted or that a running session received new instructions.

### Claude marketplace alternative

Inside Claude Code:

```text
/plugin marketplace add v2matosevic/laconia
/plugin install laconia@laconia
```

Use one Claude route. The skills-directory and marketplace installations can
collide by plugin name; `check` reports enabled duplicates. The output style
keeps Claude's software engineering instructions. SessionStart adds personal
preferences without copying them into the public package. The console skill is
available as `/laconia:laconia` when the plugin is enabled.

### Native Codex plugin alternative

The same checkout contains `.codex-plugin/plugin.json`, a discoverable console
skill and default `hooks/hooks.json`. It can be packaged in a Codex marketplace.
Its SessionStart hook adds the voice and personal preferences; its Stop hook
uses the same local checker. Review plugin hooks through Codex's normal trust
flow. Do not also run the CLI installer for that Codex profile, which would
add another instruction and hook source.

The CLI route is available independently of native plugin discovery. It keeps
a durable runtime under `~/.laconia/runtime`, adds a managed block to Codex's
AGENTS.md, installs the console skill, and wires the Stop hook. It respects
`CODEX_HOME` and `CLAUDE_CONFIG_DIR`. It does not search or modify other profiles.

## Voice and personal preferences

The shared [voice contract](output-styles/laconia.md) adapts to a question,
review, explanation or finished task. Routine replies aim below 120 words;
explanations and required steps get the room they need. A 150-word lint budget
is a soft warning threshold, not a universal answer limit.

Put personal instructions in `~/.laconia/voice.local.md`. Comments are stripped
as whole blocks. Claude and the native Codex plugin read that file at session
start. For the Codex CLI route, rerun `install --agent codex` to update the
AGENTS block, then start a new session. Personal text never enters the public
source or a replacement marketplace cache.

For example, a reader may prefer outcomes over implementation details, natural
Croatian, or no em dashes. These are personal preferences, not universal tests
of human writing. Explicit user requests, exact quotations, code and structured
output take precedence over style.

## Local checks

```sh
node bin/laconia.mjs lint draft.md --format document
node bin/laconia.mjs lint reply.md --depth --json
node bin/laconia.mjs lint --text "The fix is tested and ready to release."
node bin/laconia.mjs report 7
node bin/laconia.mjs report 7 --json
node bin/laconia.mjs audit --max-mb 100
```

`lint` reads the same user settings as the hook. Formats are `chat`, `document`
and `structured`. Valid JSON objects/arrays are recognized automatically.
Code fences, inline code, quotes and link targets are masked with positions
preserved. Use `<!-- laconia-disable -->` through `<!-- laconia-enable -->` for
intentional examples. Exit 1 means a hard preference matched, not that the
content is incorrect. An explicit user format wins over a formatting preference.

The three hard preferences are `em-dash`, `emoji` and `inline-header-bullet`.
They remain configurable and can have context-dependent false positives.
Vocabulary, density, length and layout suggestions are advisory. Documents have
no chat length or layout penalties. A clean score cannot judge clarity,
factual accuracy, naturalness or whether the answer is useful.

## Configuration

Personal overrides live in `~/.laconia/config.json`; missing fields use shipped
defaults. The checked-in [schema](config.schema.json) and runtime validator
share the accepted settings. Run `check` after an edit.

```json
{
  "mode": "advisory",
  "blockRules": ["em-dash", "inline-header-bullet", "emoji"],
  "circuitBreaker": { "maxBlocksPerSession": 2 },
  "lint": {
    "wordBudget": 150,
    "wordBudgetDepth": 600,
    "disabledRules": [],
    "format": "chat"
  }
}
```

`advisory` is the default: record findings without requesting another answer.
`block` requests a correction. `off` disables the Stop checker but leaves the
voice installed. `blockRules` selects hard preferences that request a correction;
`lint.disabledRules` removes a rule from checking and scoring entirely.
Invalid configuration degrades to advisory and disables optional browser
restrictions. Diagnostics appear in `check`, not as repeated chat interruptions.

A Stop hook runs after a reply. In a streaming client, the user can already have
seen it. Blocking cannot retract that reply and does not guarantee a clean
correction. Rewrites are logged separately, never recursively blocked, and
capped per session. The correction prompt authorizes wording changes only.

The optional `browserFirst` feature is off by default and remains separate from
writing quality. In Claude it can deny WebFetch/WebSearch when the user chooses
a browser-only workflow. It does not intercept Codex's hosted search. Laconia
does not enable it during installation.

## Reports and privacy

The ledger stores local counts and metadata, not reply text. New records include
agent, optional model, request class, correction status, and hashes of the voice
and effective config. Per-session state avoids cross-session counter races.
No data is uploaded by hooks, lint, check, report or audit.

Reports separate agents. Trend comparisons require sufficiently sized,
non-overlapping time windows with matching request class, model, contract,
config and score version. Unknown legacy metadata produces no quality claim.
`report 0` shows all history without a before/after comparison.

Audit reads a bounded sample of local transcripts and reports its coverage. A
file larger than the budget is skipped. Request classification is a heuristic,
including a few English, Croatian and German depth cues; it is not a multilingual
semantic classifier. A missing request remains unknown. Scores from different
versions are not directly comparable.

## Remove or update

Rerun the installer from the updated checkout. It backs up edited shared files
with `.laconia-bak`, preserves unrelated hook handlers even in a shared group,
and refuses malformed shared settings or instruction markers.

```sh
node bin/laconia.mjs uninstall
```

CLI uninstall removes only Laconia's managed Codex block, hook handlers and
managed skill file. It disables the local Claude plugin instead of deleting
source. It retains user config, ledger, runtime and backups. Marketplace plugins
must be removed through their agent's plugin manager.

## Verification and contribution

```sh
npm test
node bin/laconia.mjs lint README.md --format document
```

Tests exercise masking, effective budgets, config fallback, CLI options, hook
continuations, installation idempotence, peer preservation, transcript parsing
and comparable reports. CI declares Node 18/20/22 across Linux, macOS and Windows;
a declared matrix is not evidence that hosted runners executed successfully.

`scripts/evaluate.mjs` is an opt-in comparison using the user's existing Claude
and Codex CLIs. It runs writing fixtures with ambient customizations disabled,
retains the agents' core instructions and saves responses locally. It is not
part of the test suite and consumes the user's normal model allowance. Supply
`--claude`, `--codex`, `--old-voice` and `--output`. Read and judge the answers;
one small comparison does not prove a general quality improvement.

Plugin behavior was checked against [Claude output styles](https://code.claude.com/docs/en/output-styles),
[Claude hooks](https://code.claude.com/docs/en/hooks), [Codex hooks](https://learn.chatgpt.com/docs/hooks)
and [Codex packaging](https://developers.openai.com/plugins/build/plugins).

MIT licensed.
