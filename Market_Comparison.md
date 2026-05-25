# Market Comparison — REST & API Clients

Concise, sourced comparison of main features to help prioritize Oryn's roadmap.

| Feature / Product | Oryn | Postman | Insomnia | Hoppscotch | NativeRest | Bruno | Yaak | Insomnium |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| App type | Desktop / Web (goal) | Desktop, Web, CLI | Desktop (Electron) | Web, Desktop, CLI (PWA) | Unknown / lightweight | Varies (community clients) | Desktop (Tauri) | Desktop (Electron) |
| Request builder | ✓ core, focused UX | ✓ advanced (collections, body types) | ✓ strong | ✓ lightweight, fast | Basic | Basic / varies | ✓ modern request UI | ✓ focused on local testing |
| Collections / saved requests | ✓ planned | ✓ advanced | ✓ | ✓ (collections + sync) | Limited | Varies (community) | ✓ | ✓ |
| Environments / variables | ✓ planned (secure) | ✓ (environments, vault) | ✓ | ✓ (variables, workspaces) | Limited | Varies | ✓ | ✓ |
| Scripting / tests | Lightweight planned (simple assertions) | ✓ full JS scripting & tests | ✓ scripting & plugins | ✓ pre/post scripts & tests | No / limited | Varies | ✓ basic testing | ✓ testing-focused |
| Auth helpers | Planned (OAuth, tokens) | ✓ many built-in | ✓ common auth flows | ✓ OAuth, tokens, OIDC | Limited | Varies | ✓ | ✓ |
| Import (OpenAPI/Swagger, HAR) | Import planned (priority) | ✓ OpenAPI, HAR, cURL | ✓ OpenAPI, cURL | ✓ cURL, OpenAPI imports | Limited / unknown | Varies | ✓ | ✓ (local-first) |
| GraphQL support | Planned | ✓ integrated | ✓ supported | ✓ GraphQL explorer | No | Varies | ✓ | ✓ |
| Mock servers / stubbing | Planned | ✓ mock servers & monitors | ✓ mocking features | Partial / community add-ons | No | Varies | Partial | ✓ local mocking |
| Collaboration / teams | Planned (lightweight sync) | ✓ strong (workspaces, roles) | ✓ teams & git sync | ✓ cloud sync & teams | No | Varies | Limited | Local-first (privacy) |
| CLI & automation | CLI planned | ✓ Newman & CLI tools | ✓ CLI & automation plugins | ✓ Hoppscotch CLI | Unknown | Varies | ✓ CLI support | ✓ local/test runners |
| Extensibility / plugins | Plugin-friendly goal | Integrations & APIs | Plugin system & community | Extensions, add-ons, integrations | Unknown | Community-driven | Plugin/extensions possible | Limited / local plugins |
| Secrets management | Encrypted secrets planned | ✓ Postman Vault & workspace secrets | Encrypted options & plugins | Encrypted sync / cloud secrets | No | Varies | Local encrypted storage | Local-only secrets |

Sources:
- Postman docs: https://learning.postman.com/docs/ — official feature & workflows.
- Insomnia: https://insomnia.rest/ and https://docs.insomnia.rest/ — feature pages.
- Hoppscotch: https://hoppscotch.io/ and https://github.com/hoppscotch/hoppscotch — docs and repo features.
- Yaak: examples and repo search results (e.g. https://github.com/mountain-loop/yaak) — desktop Tauri clients.
- Insomnium: https://github.com/hw-a/insomnium — local-first API testing tool (GraphQL, REST, gRPC, WebSocket).
- Bruno / NativeRest: limited or fragmentary public info; referenced via GitHub search results where community projects exist.

Notes & recommendations
- Prioritize a polished, low-friction request builder, collections, and environment variables (high-impact).
- Focus on secure secrets and lightweight collaboration (team workspaces + simple sync) rather than replicating Postman's full enterprise features.
- Add import (OpenAPI / cURL) and GraphQL support early — high value for adoption.
- Offer a simple CLI and small test/assertion features (not full JS tests) to enable CI use-cases.

If you'd like, I can expand any row with direct excerpts from each product's docs and add inline links to specific feature pages.
