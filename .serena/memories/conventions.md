# Conventions

Project rules live in `.claude/rules/*.md` (code-style, git-workflow, testing, security) — follow them; key points:
- TS: `const`, early returns, explicit return types on exports, `unknown` over `any`, no empty catch, log errors with context, `@/` imports.
- Git: never commit to `main`; branch `feat/<desc>`; Conventional Commits; stage explicit paths (not `git add -A`); small PRs.
- Tests: `it('should … when …')`, negative paths required for contracts (ACL, double entry, forged proof).
- Security: no secrets in `VITE_*`, validate boundaries with zod where applicable.
- Solidity: NatSpec on public API; state in a comment what stays public vs private; max line 120 (solhint).
- Project-specific: reply/commit text in English; user (JA) communicates in Japanese.
- Never hand-type chain constants (EntryPoint, factories, contract addresses) from memory: import from the library (`viem/account-abstraction`) or copy from its source, and pin them with a test. A mistyped EntryPoint made the sponsor API reject every real request.
- The secrets hook blocks shell commands containing key-like names/values (PRIVATE_KEY, API_KEY, dev-key literals); use the Edit/Write tools for such files. `.env*` reads are denied: inspect config via the running app instead.
