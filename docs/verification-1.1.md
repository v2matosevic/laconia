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

## Session wrap, 2026-09-08

Implementation is complete and delivered on GitHub `master` at
`fc2aa5edeaf5a85010fc2d2ff270297cc51a11f1` (version 1.1.0). The repository was
clean before this documentation-only wrap. No runtime changes, model runs,
configuration updates or repeated test suite were needed during the wrap.

The local Claude source install and Codex durable runtime were refreshed during
implementation. The final implementation check confirmed unrelated global
instructions and hook handlers were preserved. On the wrap check, the generated
Codex AGENTS block still matched the source and personal preferences, the console
skill was present, and advisory mode was unchanged. The ledger now contains
version 1.1.0 Stop records for both Claude and Codex. This confirms observed
execution, not blanket trust across every agent profile or future hook change.

Fresh-session pickup:

1. Read this record and the console skill at `skills/laconia/SKILL.md`.
2. Use `node bin/laconia.mjs check` for configuration drift. Review `/hooks` only
   if the actual Codex profile reports a new or changed untrusted definition;
   do not ask the user to approve an already trusted hook again.
3. Keep private evidence under `~/.laconia/evals/2026-09-08/`. It includes the
   initial comparison, unsuccessful Claude revisions, final handoff, native
   plugin/context probes and package inventory. The initial review is
   `~/.laconia/review-2026-09-08.md`.
4. Preserve backups under `~/.laconia/backups/2026-09-08-before-1.1/` and normal
   `.laconia-bak` files. Restore only the relevant owned changes after checking
   for newer user or peer edits, never overwrite whole global configs blindly.

No npm publication, native macOS/Linux verification or statistically supported
long-term quality claim is recorded. These limits do not reopen the completed
implementation. Further work should start from an actual finding or new brief.
All evaluation subprocesses completed; no Laconia dev server or worker was left
running. Cross-project finding `i-6b6904c6` was resolved with this implementation.
