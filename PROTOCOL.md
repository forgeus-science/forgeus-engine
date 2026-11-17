# Forgeus engine protocol (`forgeus-engine/1`)

This file describes what `src/engine.ts` does, so a second implementation can be written and checked against `vectors/`. If this file and the code disagree, the code is the reference and this file has a bug.

## Inputs

Two Uniswap V3 pools on Base (chain id 8453), read with `slot0()` every 30 blocks (about 60 seconds):

| Market | Pool | Token order | Price |
|---|---|---|---|
| `ETH-USDC` | `0xd0b53D9277642d899DF5C87A3966A349A798F224` (WETH/USDC 0.05%) | WETH 18, USDC 6 | USDC per WETH |
| `BTC-USDC` | `0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef` (USDC/cbBTC 0.05%) | USDC 6, cbBTC 8 | USDC per cbBTC (inverted) |

A quote is `{ id, market, block, ts, sqrt_price, price }`. `sqrt_price` is the raw `sqrtPriceX96` as a decimal string. `price` is derived, never trusted:

```
s = Number(BigInt(sqrt_price)) / 2^96
p = s * s, then multiplied (or divided) by 10 once per decimal of (dec0 - dec1)
price = round(invert ? 1 / p : p, 6 decimals)
```

Anyone can check a quote with `eth_call` to the pool at `block`: `slot0()` (selector `0x3850c7bd`), first word.

## Parameters

| Name | Value | Meaning |
|---|---|---|
| `gen_ticks` | 60 | quotes per market in one generation window |
| `warmup` | 60 | quotes before the window, used only for lookbacks |
| `pop` | 24 | strategies per generation |
| `cost_bps` | 5 | paper cost per unit of position change |
| `dd_weight` | 0.5 | fitness = return − 0.5 × max drawdown |
| `idle_penalty` | 0.001 | fitness of a strategy that never traded |

## Genome

`{ kind, market, lookback, threshold_bps, size, stop_bps }` with `kind` one of `momentum`, `meanrev`, `breakout`, `trend`. Bounds: lookback 3–60, threshold 0–100 bps, size 0.1–1, stop 20–400 bps.

Signal at tick `i` over prices `p` (L = lookback, th = threshold in bps):

- **momentum:** `r = (p[i] − p[i−L]) / p[i−L]` in bps. Long if `r > th`, short if `r < −th`, else flat.
- **meanrev:** `z = (p[i] − sma(L)) / sma(L)` in bps. Short if `z > th`, long if `z < −th`, else flat.
- **breakout:** high/low of `p[i−L .. i−1]`. Long above `high × (1 + th)`, short below `low × (1 − th)`, otherwise keep the current position.
- **trend:** `d = (sma(max(2, ⌊L/3⌋)) − sma(L)) / sma(L)` in bps. Long if `d > th`, short if `d < −th`, else flat.

## Paper simulation

For each tick `i` in the window (except the last): compute the signal, apply the stop (if the move against the entry exceeds `stop_bps`, close and stay flat while the signal keeps pointing the same way), set the position to `direction × size`, then earn `position × (p[i+1] − p[i]) / p[i]`. Every change in position pays `|Δposition| × cost_bps`. An open position is closed at the last quote. Return = final equity − 1. Max drawdown is measured on the equity curve. All values are rounded to 8 decimals.

The hold baseline per market buys at the first window quote and sells at the last, paying the cost twice.

## One generation

1. `seed = sha256(prev_hash + ":" + n)[0..8]` (hex). `rng = mulberry32(seed)`.
2. Score all 24 strategies on their market. Sort by fitness, ties by id.
3. Ranks 1–12 survive, 13–24 are culled.
4. Offspring per survivor rank: 3, 3, 2, 2, 1, 1 (ranks 1–6). Each offspring is a mutation of its parent, drawn from `rng` in rank order. A mutation always changes at least one field.
5. Next population = 12 survivors + 12 offspring (born `n + 1`).
6. The generation is **null** when no strategy has a positive return and a fitness above its market's hold baseline. Null generations are published like any other.

Generation 1 uses the genesis population drawn from `rng(seed(GENESIS_HASH, 0))`: six strategies of each kind (in pairs), alternating between the two markets.

## Record and hash chain

The record holds `v, n, engine, prev_hash, seed, params, window, population, results, baseline, offspring, trades_hash, null, null_reason, best`. `window[market].quotes_hash = sha256(canonical([[id, block, sqrt_price], …]))` over warmup + window quotes. `trades_hash = sha256(canonical(trades))`.

```
canonical(x) = JSON with object keys sorted, undefined dropped, no whitespace
hash(n)      = sha256(prev_hash + "\n" + canonical(record))
prev_hash(1) = "0" × 64
```

Editing or deleting any generation changes its hash and breaks every link after it.

## Replay

`replay(archive)` takes `{ record, hash, quotes, trades }` from `GET /v1/generations/:n/archive` and checks, in order: every price matches its `sqrtPriceX96`; the record hashes to the published hash; re-running the generation gives the same seed, quotes hashes, results, culls, offspring, trades and null flag; the recomputed hash equals the published hash. A generation verifies only if every check passes.

## Determinism

Only `+ − × ÷` and comparisons are used on floats, plus `Math.round`, `Math.floor`, `Math.abs`, `Math.min`, `Math.max` and `Math.imul`, so results are identical in every JavaScript engine. `sha256` uses WebCrypto when it exists and a pure JS implementation otherwise (insecure browser contexts); the tests check both against `node:crypto`.
