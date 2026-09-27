# Agora — Agent Instructions

## Code changes

All code changes in this project MUST go through **OpenCode** with the **ponytail** plugin, using **Serena MCP** and **codegraph** for semantic code understanding.

### Why

- **OpenCode** is the designated coding agent for Agora (provider-agnostic, session management, plugin ecosystem).
- **ponytail** enforces a "lazy senior dev" discipline — write only what's needed, reuse before inventing, prefer native/browser/platform features over libraries. This keeps the codebase lean and safe.
- **Serena MCP** provides semantic code navigation (symbol lookup, cross-file references, language-server–backed edits) instead of naive text search-and-replace.
- **codegraph** maintains a persistent index of the codebase for fast, accurate code retrieval.

### Workflow

All tools below are pre-configured in OpenCode and available by default — no manual activation needed.

1. **codegraph** (MCP) — use for symbol search (`codegraph_query`), codebase exploration (`codegraph_explore`), and node-level navigation (`codegraph_node`). Run `codegraph sync` if the index is stale.
2. **Serena MCP** — use for semantic code navigation: symbol lookup, cross-file references, find definitions/references, and language-server–backed edits. Project config at `.serena/project.yml` (languages: Python + TypeScript).
3. **ponytail** — follow the ladder before writing code:
   - Does this need to exist? → no: skip (YAGNI)
   - Already in this codebase? → reuse it (use codegraph/serena to check)
   - Stdlib does it? → use it
   - Native platform feature? → use it (e.g. `<input type="date">` not flatpickr)
   - Installed dependency? → use it
   - One line? → one line
   - Only then: the minimum that works
4. Never cut validation, error handling, security, or accessibility.

### Tooling summary

| Tool | Type | What it does |
|---|---|---|
| ponytail | Plugin | Lazy senior dev ladder — prevents over-engineering |
| codegraph | MCP server | Code intelligence — symbol search, call paths, explore |
| Serena | MCP server | Language-server semantics — refs, definitions, cross-file nav |

### Don't

- Edit Agora files directly from Hermes terminal — delegate to OpenCode.
- Install new dependencies without checking ponytail's ladder first.
- Over-build: no wrappers around things the platform already provides.
