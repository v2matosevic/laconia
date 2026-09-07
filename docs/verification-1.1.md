# Laconia 1.1 verification

Verified on Windows on 2026-09-08. No change to model accounts, shell setup,
permission settings or hook trust is needed by the installer.

## Implemented

The shared voice adapts to the request and preserves facts, delivery status,
required formats and coding obligations. Personal preferences reach Claude via
SessionStart and Codex via its generated AGENTS block or native plugin hook.
Both native manifests expose the console skill. The old root SKILL.md remains
a compatibility pointer; its prior scope safeguards are retained in the console.

Advisory is the default. Invalid config stays non-interrupting. Lint, hooks and
audit use the same settings; structured output and literal material are
preserved. Scoring uses the actual budget. Reports separate agents and require
matching metadata and disjoint periods before showing trends. Corrections are
logged separately and cannot recursively block. Session state is partitioned
and locked independently.

The installer preserves unrelated prose and handlers within shared hook groups,
refuses malformed shared files, keeps backups, and retains source on uninstall.
Codex-only installs have a durable runtime and discoverable console skill.
README, metadata and CI no longer promise invisible rewrites or an npm release.

## Deterministic verification

`npm test` covers 48 checks, including the original 27 linter tests, regression
fixtures for demonstrated false positives, config/schema fallback, budgets,
argument parsing, continuations, deduplication, circuit limits, request parsing,
install/reinstall/uninstall, peer preservation, native layouts and report
comparability. Tests use private agent homes.

Claude's strict plugin manifest validation passes. Codex's plugin validator and
the console skill validator pass. The package manifest includes both agent
manifests, the schema, skill, runtime and hooks. Documentation lint and
`git diff --check` pass. CI uses these fixtures across Node 18/20/22 and the three
OS families; hosted CI and native macOS/Linux were not run for this record.

## Native verification

- Claude Code 2.1.263 discovers one Laconia skill and three lifecycle events.
  A plugin-only session retrieved separate sentinel values from a copied shared
  output style and private personal preferences. Actual SessionStart and Stop
  events completed successfully. No tools were available to that writing probe.
- Codex CLI 0.153.4 installed and listed the package from a temporary local
  marketplace in a private profile, without credentials or persistent trust
  changes. Its marketplace cache identifies version 1.1.0 as enabled.
- A real Codex writing session retrieved the personal sentinel from an
  installer-generated AGENTS block. The run used existing authentication,
  read-only access and disabled ambient hooks for isolation. This proves the
  instruction route, not trust of a newly installed hook.
- Both native agents returned an exact JSON object containing an em dash and
  emoji without adding prose or changing its values.

## Voice comparison and limits

The opt-in evaluator compared two synthetic requests under the old and new
contracts on each agent, plus exact JSON preservation. It retained each agent's
core instructions and isolated ambient customization. Codex used Astra with high
reasoning; Claude used its native default model. The first new Claude handoff
invented an approval step. A follow-up repeated status and made a broad promise.
Those findings drove explicit factual-scope guidance and one short handoff
example. The final handoffs were two sentences and retained local-only delivery.

This is a small, unblinded sample with one response per arm, not a statistical
claim that writing quality improved generally. Preserve the unsuccessful outputs
in the private evaluation archive. New long-term trends need matching metadata;
old ledger rows remain readable but cannot supply a controlled baseline.

Native Codex plugin hooks still require the user's normal trust review. New
voice instructions reach new sessions; existing sessions are not restarted by
Laconia. Package-source verification, actual local activation and publication
are separate states.
