---
id: SPEC-CODEX-ADAPTER
type: spec
status: draft
owner: hugo
created: 2026-07-17
updated: 2026-07-17
source_docs:
  - docs/product/briefs/2026-07-16-live-usage.md
  - docs/product/pitch.md
parent_ids: [BRIEF-LIVE-USAGE]
child_docs: []
tags: [gnome, codex, adapter]
supersedes: []
---

# Spec: Codex Adapter

## Goal

Show trustworthy live Codex weekly usage in the existing GNOME Shell surface while
a separately user-managed Codex app-server daemon is available, without starting,
authenticating, or otherwise changing Codex.

## User Journeys

### J-004 — See Codex usage (creates)

Intent: see the current Codex weekly limit while the separately managed daemon is
available.

Acceptance:

- **J-004.1** A running supported, separately user-managed Codex app-server daemon
  makes the Codex provider eligible and adds its existing mark and weekly percentage
  to the unified panel.
- **J-004.2** The popup shows the provider's fresh weekly percentage and reset time
  through the existing usage-card treatment.
- **J-004.3** Absence or closure of the managed daemon removes Codex eligibility;
  ordinary Codex CLI processes alone do not make it eligible, and the adapter never
  starts, authenticates, or keeps a Codex process alive.
- **J-004.4** An unsupported, malformed, or failed usage response becomes the
  existing unavailable state and immediately clears prior values.

## Surface Map

- Unified panel item — existing Codex mark and weekly metric while the adapter is
  eligible.
- Codex provider card — existing live metric or unavailable treatment.
- Absent Codex state — no Codex contribution when no supported daemon is available.

## Cross-Journey Acceptance

- The adapter persists no server address, credential, raw response, usage value, or
  error detail.
- It uses only an already-running supported local daemon and makes no process-launch,
  login, browser, or dashboard-scraping attempt.

## Design

Canonical reference: [Direction D — Selected Blend](../../../design/direction-lab/DIRECTION-BRIEF.md#d--selected-blend).
The adapter composes the existing Codex provider mark, `ProviderCard`, `UsageMetric`,
`ProgressBar`, and unavailable treatment. New primitives: none.

## Contracts

- API: [Provider slot](../../engineering/api-contracts.md#provider-slot) — delta: a
  Codex module implements the existing provider object with one weekly window.
- Data: [Data model](../../engineering/data-model.md) — delta: no durable adapter
  data; transport results reduce to the presentation contract.
- Decisions: [Decision log](../../engineering/decision-log.md) — records the
  evidenced local-server transport and payload mapping before integration lands.

## Architecture

The packaged production extension includes a Codex adapter module that registers
against the in-process provider slot. It observes a separately user-managed local
Codex app-server daemon, then obtains the daemon's supported usage representation
asynchronously. The adapter owns local presence and transport handling; the surface
continues to own polling, rendering, and provider lifecycle. No process is spawned by
either layer.

## Preserve

- The pitch's opportunistic-visibility, privacy, and fail-closed constraints.
- The surface's strict provider-slot validation and one shared refresh cycle.
- The installed extension remains free of test stubs, credentials, and provider
  payload logging.

## Build Slices

- [ ] `CODEX-001` — evidence the separately user-managed daemon's supported local
  presence, transport, and usage contract; add a deterministic protocol fixture and
  record the resulting mapping decision. Medium: one transport-boundary invariant,
  at most 14 files and 750 handwritten lines.
- [ ] `CODEX-002` — implement the provider module against the evidenced contract,
  package it, and prove J-004 through the production surface. Medium: one
  eligibility-to-presentation invariant, at most 15 files and 800 handwritten lines.

## Non-Scope

- Starting or authenticating Codex, browser/dashboard automation, or undocumented
  remote endpoint probing.
- Treating ordinary Codex CLI processes as provider presence.
- Claude Code integration, usage history, notifications, or new visual primitives.

## Open Questions

- `CODEX-001` must establish the supported local daemon transport, presence signal,
  usage request, and response semantics before `CODEX-002` is planned or implemented.
