# Install Laconia on a new machine

Requires Node 18 or newer, and `gh` authenticated as `v2matosevic` (the repo is private).

## 1. Clone to this exact path

The path is load-bearing. Claude Code auto-loads plugins from `~/.claude/skills/`.

```bash
mkdir -p ~/.claude/skills
gh repo clone v2matosevic/laconia ~/.claude/skills/laconia
```

If `gh` is not set up: `git clone https://github.com/v2matosevic/laconia.git ~/.claude/skills/laconia`

## 2. Install

```bash
cd ~/.claude/skills/laconia
node install.mjs
node install.mjs --check
```

`--check` must report `ok` for Claude Code, and for Codex if Codex is installed.

## 3. Trust the Codex hook

Codex refuses to run an untrusted hook. Open Codex, run `/hooks`, review the
Laconia entry, trust it. Once per machine. Skip if Codex is not installed.

## 4. Restart every running session

Hooks and system prompts are read at session start. Existing sessions are unaffected
until restarted.

## Verify it works

```bash
node bin/laconia-lint.mjs --text "Fixed — and deployed."
```

Must exit 1 and report a hard `em-dash` violation.

Then ask any agent to reply with a sentence containing an em dash. The gate blocks
the first attempt and the reply you see comes back without one.

## Rules

- Do not hand-edit `~/.codex/AGENTS.md` between the `laconia:start` and
  `laconia:end` markers. Edit `output-styles/laconia.md` and re-run `node install.mjs`.
- Do not commit `laconia.config.json` changes without saying so. It is shared across
  machines and tuning it on one changes both.
- Update with `git pull && node install.mjs`.
- Turn it off with `claude plugin disable laconia@skills-dir`, or set `"mode": "advisory"`
  in `laconia.config.json`.

## Scope

Covered: Claude Code and Codex, every workspace on the machine, no per-repo setup.

Not covered: Claude Code subagents run their own system prompt. Codex web search is
a hosted tool that hooks cannot intercept. Opencode is not wired.
