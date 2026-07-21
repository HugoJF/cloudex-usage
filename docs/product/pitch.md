---
id: PITCH-CLAUDEX-USAGE
type: pitch
status: active
owner: hugo
created: 2026-07-16
updated: 2026-07-17
tags: [gnome, codex, claude, usage]
---

# Pitch: Claudex Usage

## Problem & Thesis

Subscription-backed coding agents expose rolling usage limits, but checking them
requires interrupting work and opening separate status views. A small GNOME Shell
indicator should make the current limits legible exactly when the corresponding
agent application is in use, then disappear. It should not invent a background
monitoring obligation when no agent is open.

## Target User

One Linux desktop user who works with both Codex and Claude Code and wants a
low-friction, privacy-conscious view of remaining capacity.

## Core Promise

When you are using Codex or Claude Code, the GNOME panel shows their current
usage windows and reset times; otherwise it stays out of the way.

## Differentiators

- One panel surface for both providers, with provider-specific adapters.
- Opportunistic visibility: each indicator is hidden unless its matching app is
  active or present, rather than continuously polling in the background.
- Codex uses the existing Codex CLI credential to request current usage only while a
  local Codex session is present; it never starts or authenticates Codex.
- Claude uses the existing authenticated Claude Code OAuth credential and its
  usage endpoint, following the approach of the Claude Usage Extension.
- No credentials or raw provider responses are persisted, logged, or displayed.

## Non-Goals (product-level)

- Managing subscriptions, purchasing credits, or changing account settings.
- Starting, authenticating, or keeping Codex/Claude running for monitoring.
- Scraping browser dashboards or requiring browser automation.
- Sharing telemetry, credentials, or usage history with another service.
- Probing provider endpoints beyond the explicitly accepted Codex usage endpoint;
  adapters must fail closed when their supported response contract changes.

## Success Definition

While an eligible application is open, the panel presents fresh usage percentages
and reset information without interfering with the agent. When it closes, its
indicator and polling stop. A provider outage, expired session, or unusable Codex
response produces no stale or misleading value.

## Open Questions (product-level)

- Which concrete GNOME application IDs/window classes identify Codex and Claude
  Code on this machine?
- Is Claude Code process presence sufficient, or must the widget be tied to a
  terminal/window that hosts it?
- What refresh interval balances usefulness and provider/network load?
