# forgeus-engine

The deterministic evolution engine behind [Forgeus](https://forgeus.science). 24 paper-trading strategies are scored on live Uniswap V3 quotes from Base, the weak half is culled, the survivors mutate, and every generation is published as a hash-chained record. This repo lets you recompute any generation yourself and get the same hash.

**Paper only.** No orders are sent and no funds move. Real execution is not live, and the $FOUS token has not launched.

- One file, no dependencies: [`src/engine.ts`](src/engine.ts). The app serves the same file at <https://dapp.forgeus.science/engine.ts>, and `npm run check-live` checks that the two are byte-identical.
- Spec: [`PROTOCOL.md`](PROTOCOL.md)
- Test vectors: [`vectors/`](vectors) (real archives from the public API)
- Website: <https://forgeus.science> · Docs: <https://docs.forgeus.science> · App: <https://dapp.forgeus.science>

## Use

Node 22.18 or newer (it runs TypeScript files directly). Nothing to install.

```bash
npm test                  # replay the vectors, tamper tests, sha256, mutation bounds
npm run replay -- latest  # replay the latest live generation from the public API
npm run replay -- 12      # or any generation number
npm run verify-chain      # walk every published generation back to genesis
npm run check-live        # is the engine the app serves the same as this file?
```

From your own code:

```js
import { replay } from "./src/engine.ts";

const archive = await (await fetch("https://dapp.forgeus.science/v1/generations/1/archive")).json();
const { ok, checks } = await replay(archive);
```

## What the replay checks

| Check | Passes when |
|---|---|
| Prices | every `price` equals the value derived from its `sqrtPriceX96` |
| Record hash | `sha256(prev_hash + "\n" + canonical(record))` equals the published hash |
| Seed | `sha256(prev_hash + ":" + n)` gives the published seed |
| Quotes hash | warmup + window quotes hash to the value in the record |
| Results, culls, offspring | re-running the generation gives identical output |
| Paper trades | identical trade list and `trades_hash` |
| Null flag | same null result |
| Recomputed hash | the re-run record hashes to the published hash |

Each quote can also be checked against the chain: `eth_call` the pool's `slot0()` at the quote's block.

## Updating vectors

```bash
npm run vectors -- 1 2 3 27
```

## License

MIT
