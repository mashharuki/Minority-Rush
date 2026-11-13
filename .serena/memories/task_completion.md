# Definition of done

Contracts changed:
1. `bun run test` (all pass)
2. `cd packages/contracts && bunx solhint "contracts/**/*.sol"` (no errors)
3. `bun run export:abi` and commit the regenerated `abi.json`

Web changed:
1. `cd apps/web && bunx tsc -b` and `bun run build`
2. Exercise the demo flow in a browser (login -> seal -> reveal).

Claims: say explicitly what was not verified (live Sepolia path is untested until deployed).
