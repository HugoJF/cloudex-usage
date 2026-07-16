# Provider marks

These SVGs are vendored only for the local, non-production direction lab.

- `claude.svg` and `claude-light.svg` are the dark- and light-theme Claude Agent
  icons cached from the
  [Agent Client Protocol registry](https://cdn.agentclientprotocol.com/registry/v1/latest/claude-acp.svg).
  The registry attributes the adapter to Anthropic, Zed Industries, and JetBrains and
  identifies its license as proprietary. The same Claude mark is also present in the
  BSD-2-Clause reference project that inspired this exploration.
- `codex.svg` and `codex-light.svg` are the dark- and light-theme icons cached for
  the Apache-2.0
  [Codex ACP adapter](https://github.com/agentclientprotocol/codex-acp). It uses OpenAI's
  monochrome Blossom mark; the official Codex product page uses the same OpenAI mark
  and does not publish a distinct Codex glyph.

The paired files are the registry's unmodified `icon_dark.svg` and `icon.svg`
variants; runtime selection changes contrast without tinting or altering either mark.

Claude and Anthropic are trademarks of Anthropic. Codex, OpenAI, and the Blossom mark
are trademarks of OpenAI. Before distributing a production extension, re-check both
providers' current trademark and asset-redistribution terms and replace these review
assets if either provider supplies a more specific approved integration asset.
