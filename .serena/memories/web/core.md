# apps/web

- Entry `src/main.tsx` renders `src/poker/PokerApp.tsx`: login -> lobby -> table. CSS: `src/styles/app.css` (legacy `c--*`) + `src/poker/poker.css` (`p--*`).
- `src/poker/client.ts` defines `PokerClient`; `livePokerClient.ts` (viem + `@zama-fhe/sdk`, batches faucet/operator/observer with the first table action) and `demoPokerClient.ts` (offline, built-in bot). `index.ts` picks one.
- `src/poker/tableController.ts` — framework-free table logic (polling, optimistic moves, opponent-card reveal, background confirm/finalize/timeout, bot pings); `useTable.ts` is a thin hook. `rules.ts` mirrors the contract's betting rules.
- `src/lib/env.ts` — `isPokerDeployed` from deployment JSON / `VITE_*` overrides; `VITE_BOT_ADDRESS` + `VITE_BOT_API_URL` enable "Play the bot" in live mode.
- `@/` alias -> `src/`.
- PWA: `vite-plugin-pwa` injectManifest; policy lives in `src/sw.ts`; `src/lib/pwa.ts` hook.

Invariants:
- UI talks only to `PokerClient`; the client only ever decrypts the OPPONENT's card handle.
- Turn timers use chain time (`chainNowMs`), never the browser clock.
- Only public values in `VITE_*`.
- Client SDK is `@zama-fhe/sdk` (not deprecated relayer-sdk).
- SW caches shell + fonts only; RPC/relayer/wallet/non-GET must stay uncached; never cache decrypted data.
- The built-in browser pane cannot register service workers: test SW/install in real Chrome/Safari.
