import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  BOUNDS, GENESIS_HASH, KINDS, MARKET_IDS, PARAMS, canonical, genesis, hashRecord,
  mutate, nextPopulation, priceFromSqrt, replay, rng, seedFor, sha256,
} from "../src/engine.ts";

const dir = new URL("../vectors/", import.meta.url);
const vectors = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
  .map((f) => JSON.parse(fs.readFileSync(new URL(f, dir), "utf8")));
const byN = new Map(vectors.map((v) => [v.record.n, v]));
const clone = (x) => structuredClone(x);

test("vectors are present", () => {
  assert.ok(vectors.length >= 3, "expected at least 3 vectors");
});

for (const v of vectors) {
  test(`generation ${v.record.n} replays to its published hash`, async () => {
    const { ok, checks } = await replay(v);
    const failed = checks.filter((c) => !c.ok).map((c) => c.name);
    assert.deepEqual(failed, []);
    assert.equal(ok, true);
  });
}

test("generation 1 starts from the genesis hash and the genesis population", async () => {
  const g1 = byN.get(1);
  assert.ok(g1, "vectors must include generation 1");
  assert.equal(g1.record.prev_hash, GENESIS_HASH);
  assert.equal(canonical(g1.record.population), canonical(await genesis()));
});

test("consecutive vectors link: prev_hash and population carry over", () => {
  for (const v of vectors) {
    const prev = byN.get(v.record.n - 1);
    if (!prev) continue;
    assert.equal(v.record.prev_hash, prev.hash, `gen ${v.record.n} prev_hash`);
    assert.equal(canonical(v.record.population), canonical(nextPopulation(prev.record)), `gen ${v.record.n} population`);
  }
});

test("population size and cull are fixed", () => {
  for (const v of vectors) {
    assert.equal(v.record.population.length, PARAMS.pop);
    assert.equal(v.record.results.filter((r) => r.outcome === "culled").length, PARAMS.pop / 2);
    assert.equal(v.record.offspring.length, PARAMS.pop / 2);
  }
});

test("a changed quote is detected", async () => {
  const v = clone(vectors[0]);
  const q = v.quotes[MARKET_IDS[0]][PARAMS.warmup + 5];
  q.sqrt_price = (BigInt(q.sqrt_price) + 10n ** 15n).toString();
  const { ok } = await replay(v);
  assert.equal(ok, false);
});

test("an edited result breaks the record hash", async () => {
  const v = clone(vectors[0]);
  v.record.results[0].ret += 0.01;
  assert.notEqual(await hashRecord(v.record), v.hash);
  assert.equal((await replay(v)).ok, false);
});

test("a dropped trade is detected", async () => {
  const v = clone(vectors.find((x) => x.trades.length > 0));
  v.trades.pop();
  assert.equal((await replay(v)).ok, false);
});

test("sha256 matches node:crypto, including the pure JS fallback", async () => {
  const inputs = ["", "abc", "a".repeat(1000), "forgeus\n{\"n\":1}", "ünïcødé ✓"];
  for (const s of inputs) {
    const want = createHash("sha256").update(s).digest("hex");
    assert.equal(await sha256(s), want, `subtle: ${JSON.stringify(s)}`);
  }
  const saved = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
  try {
    for (const s of inputs) {
      assert.equal(await sha256(s), createHash("sha256").update(s).digest("hex"), `js: ${JSON.stringify(s)}`);
    }
  } finally {
    Object.defineProperty(globalThis, "crypto", saved);
  }
});

test("canonical JSON ignores key order and undefined", () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 3, c: undefined }] }), canonical({ a: [2, { d: 3 }], b: 1 }));
  assert.equal(canonical({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test("seed and rng are deterministic", async () => {
  const s = await seedFor(GENESIS_HASH, 1);
  assert.equal(s, await seedFor(GENESIS_HASH, 1));
  assert.match(s, /^[0-9a-f]{8}$/);
  const a = rng(s), b = rng(s);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test("mutation always changes something and stays in bounds", async () => {
  const r = rng(await seedFor(GENESIS_HASH, 99));
  for (const m of await genesis()) {
    for (let i = 0; i < 200; i++) {
      const { genome, diffs } = mutate(m.genome, r);
      assert.ok(diffs.length > 0);
      assert.ok(KINDS.includes(genome.kind));
      assert.ok(MARKET_IDS.includes(genome.market));
      for (const k of ["lookback", "threshold_bps", "size", "stop_bps"]) {
        assert.ok(genome[k] >= BOUNDS[k][0] && genome[k] <= BOUNDS[k][1], `${k}=${genome[k]}`);
      }
    }
  }
});

test("prices come from sqrtPriceX96 with the right decimals", () => {
  const v = vectors[0];
  for (const m of MARKET_IDS) {
    for (const q of v.quotes[m]) assert.equal(priceFromSqrt(q.sqrt_price, m), q.price);
  }
  const eth = v.quotes["ETH-USDC"][0].price, btc = v.quotes["BTC-USDC"][0].price;
  assert.ok(eth > 100 && eth < 100000, `ETH ${eth}`);
  assert.ok(btc > 1000 && btc < 1000000, `BTC ${btc}`);
});
