# apps/web

- Single-screen-state app (`src/App.tsx`): login -> setup -> pick -> sealed -> reveal; UI parts in `src/components.tsx`; CSS in `src/styles/app.css` (ported from mockup, `c--*`/`is--*` classes, no Lism).
- `src/lib/types.ts` defines `GameClient` interface; two impls chosen by `src/lib/client.ts`:
  - `liveClient.ts` — viem + `@zama-fhe/sdk` (injected wallet, Sepolia). NOT yet run against Sepolia/relayer.
  - `demoClient.ts` — offline simulation, nothing encrypted; used when contracts undeployed or `VITE_DEMO_MODE=true`.
- `src/lib/env.ts` — `isDeployed` derives from deployment JSON / `VITE_*` overrides.
- `@/` alias -> `src/`.
- PWA: `vite-plugin-pwa` injectManifest; policy lives in `src/sw.ts` (own `tsconfig.sw.json`, excluded from app tsconfig); `src/lib/pwa.ts` hook (offline/install/update). Icons in `public/icons` (generated PNGs).

Invariants:
- UI talks only to `GameClient`; never import SDK/viem in components.
- Decryption (permit prompt) only on user click, except post-deadline auto settle+claim.
- Only public values in `VITE_*`.
- Client SDK is `@zama-fhe/sdk` (not deprecated relayer-sdk).
- SW caches shell + fonts only; RPC/relayer/wallet/non-GET must stay uncached; never cache decrypted data. Updates are prompt-based (no auto reload).
- The built-in browser pane cannot register service workers (even a trivial one fails): test SW/install in real Chrome/Safari.
