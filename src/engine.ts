// Forgeus evaluation engine.
//
// Pure and deterministic: the Worker uses it to close generations and the
// browser replay tool runs the exact same code on a downloaded archive.
// Only + - * / and comparisons are used on floats so results are identical
// in every JavaScript engine.

export const ENGINE_VERSION = "forgeus-engine/1";

export const PARAMS = {
	gen_ticks: 60, // quotes per market in one generation window
	warmup: 60, // quotes before the window used for lookbacks
	pop: 24, // strategies per generation
	cost_bps: 5, // paper cost per unit of position change (pool fee tier)
	dd_weight: 0.5, // fitness = return - dd_weight * max drawdown
	idle_penalty: 0.001, // a strategy that never trades has no evidence: fitness -0.1%
} as const;

export const MARKETS = {
	"ETH-USDC": {
		label: "WETH/USDC 0.05%",
		venue: "Uniswap V3 on Base",
		chain_id: 8453,
		pool: "0xd0b53D9277642d899DF5C87A3966A349A798F224",
		dec0: 18,
		dec1: 6,
		invert: false,
	},
	"BTC-USDC": {
		label: "USDC/cbBTC 0.05%",
		venue: "Uniswap V3 on Base",
		chain_id: 8453,
		pool: "0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef",
		dec0: 6,
		dec1: 8,
		invert: true,
	},
} as const;

export type Market = keyof typeof MARKETS;
export const MARKET_IDS = Object.keys(MARKETS) as Market[];

export const KINDS = ["momentum", "meanrev", "breakout", "trend"] as const;
export type Kind = (typeof KINDS)[number];

export const BOUNDS = {
	lookback: [3, 60],
	threshold_bps: [0, 100],
	size: [0.1, 1],
	stop_bps: [20, 400],
} as const;

export type Genome = {
	kind: Kind;
	market: Market;
	lookback: number;
	threshold_bps: number;
	size: number;
	stop_bps: number;
};

export type Quote = {
	id: number;
	market: Market;
	block: number;
	ts: number; // unix seconds of the block
	sqrt_price: string; // slot0 sqrtPriceX96, decimal string
	price: number; // quote asset (USDC) per base asset
};

export type Member = { id: string; genome: Genome; parent: string | null; born: number };

export type Diff = { field: keyof Genome; from: string | number; to: string | number };

export type Result = {
	id: string;
	ret: number;
	maxdd: number;
	fitness: number;
	trades: number;
	rank: number;
	outcome: "survived" | "culled";
};

export type Baseline = { ret: number; maxdd: number; fitness: number };

export type Window = {
	from_id: number;
	to_id: number;
	from_block: number;
	to_block: number;
	start_ts: number;
	end_ts: number;
	warmup_from_id: number;
	quotes_hash: string;
};

export type Offspring = { id: string; parent: string; genome: Genome; diffs: Diff[] };

export type GenerationRecord = {
	v: 1;
	n: number;
	engine: string;
	prev_hash: string;
	seed: string;
	params: typeof PARAMS;
	window: Record<Market, Window>;
	population: Member[];
	results: Result[];
	baseline: Record<Market, Baseline>;
	offspring: Offspring[];
	trades_hash: string;
	null: boolean;
	null_reason: string | null;
	best: { id: string; fitness: number; ret: number };
};

export type Trade = {
	strategy: string;
	market: Market;
	quote_id: number;
	block: number;
	ts: number;
	price: number;
	from: number; // position before (-1..1)
	to: number; // position after
	reason: "signal" | "stop" | "close";
};

export const GENESIS_HASH = "0".repeat(64);

// ---------- helpers ----------

export const round = (x: number, d = 1e8) => Math.round(x * d) / d;

/** sqrtPriceX96 → USDC per base asset. */
export function priceFromSqrt(sqrt: string, market: Market): number {
	const m = MARKETS[market];
	const s = Number(BigInt(sqrt)) / 2 ** 96;
	let p = s * s;
	const shift = m.dec0 - m.dec1;
	for (let i = 0; i < Math.abs(shift); i++) p = shift > 0 ? p * 10 : p / 10;
	return round(m.invert ? 1 / p : p, 1e6);
}

/** Canonical JSON: sorted keys, no whitespace. */
export function canonical(v: unknown): string {
	if (v === null || typeof v !== "object") return JSON.stringify(v);
	if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
	const o = v as Record<string, unknown>;
	return `{${Object.keys(o)
		.filter((k) => o[k] !== undefined)
		.sort()
		.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
		.join(",")}}`;
}

export async function sha256(text: string): Promise<string> {
	const data = new TextEncoder().encode(text);
	// crypto.subtle only exists in secure contexts (https/localhost); fall back to plain JS elsewhere.
	const bytes = (globalThis as { crypto?: Crypto }).crypto?.subtle ? new Uint8Array(await crypto.subtle.digest("SHA-256", data)) : sha256js(data);
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const K256 = Uint32Array.from([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
	0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
	0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
	0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256js(msg: Uint8Array): Uint8Array {
	const len = msg.length;
	const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
	padded.set(msg);
	padded[len] = 0x80;
	const dv = new DataView(padded.buffer);
	dv.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
	dv.setUint32(padded.length - 4, (len << 3) >>> 0);
	const h = Uint32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
	const w = new Uint32Array(64);
	const rot = (x: number, n: number) => (x >>> n) | (x << (32 - n));
	for (let off = 0; off < padded.length; off += 64) {
		for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
		for (let i = 16; i < 64; i++) {
			const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
			const s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
			w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
		}
		let [a, b, c, d, e, f, g, hh] = h;
		for (let i = 0; i < 64; i++) {
			const t1 = (hh + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
			const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
			hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
		}
		h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
	}
	const out = new Uint8Array(32);
	const ov = new DataView(out.buffer);
	h.forEach((v, i) => ov.setUint32(i * 4, v));
	return out;
}

export const hashRecord = (r: GenerationRecord) => sha256(`${r.prev_hash}\n${canonical(r)}`);
export const quotesHash = (qs: Quote[]) => sha256(canonical(qs.map((q) => [q.id, q.block, q.sqrt_price])));
export const tradesHash = (ts: Trade[]) => sha256(canonical(ts));
export const seedFor = async (prevHash: string, n: number) => (await sha256(`${prevHash}:${n}`)).slice(0, 8);

/** mulberry32: small, deterministic PRNG. */
export function rng(seedHex: string) {
	let a = parseInt(seedHex, 16) >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const pad = (k: number) => String(k).padStart(2, "0");
export const memberId = (born: number, k: number) => `f${born}-${pad(k)}`;

// ---------- signals ----------

function sma(p: number[], i: number, len: number) {
	let s = 0;
	for (let k = i - len + 1; k <= i; k++) s += p[k];
	return s / len;
}

/** Target direction at index i: 1 long, -1 short, 0 flat, null = keep. */
export function signal(g: Genome, p: number[], i: number): -1 | 0 | 1 | null {
	const L = g.lookback;
	const th = g.threshold_bps;
	if (g.kind === "momentum") {
		const r = ((p[i] - p[i - L]) / p[i - L]) * 1e4;
		return r > th ? 1 : r < -th ? -1 : 0;
	}
	if (g.kind === "meanrev") {
		const m = sma(p, i, L);
		const z = ((p[i] - m) / m) * 1e4;
		return z > th ? -1 : z < -th ? 1 : 0;
	}
	if (g.kind === "breakout") {
		let hi = -Infinity;
		let lo = Infinity;
		for (let k = i - L; k < i; k++) {
			if (p[k] > hi) hi = p[k];
			if (p[k] < lo) lo = p[k];
		}
		if (p[i] > hi * (1 + th / 1e4)) return 1;
		if (p[i] < lo * (1 - th / 1e4)) return -1;
		return null;
	}
	const fast = sma(p, i, Math.max(2, Math.floor(L / 3)));
	const slow = sma(p, i, L);
	const d = ((fast - slow) / slow) * 1e4;
	return d > th ? 1 : d < -th ? -1 : 0;
}

// ---------- simulation ----------

export type SimResult = { ret: number; maxdd: number; trades: Trade[]; equity: number[]; pos: number };

/**
 * Paper trade one genome over quotes[start..end].
 * quotes before `start` are warmup only. A position chosen at tick i earns
 * the move from i to i+1. Opening and the final close both pay the cost.
 */
export function simulate(id: string, g: Genome, quotes: Quote[], start: number, close = true): SimResult {
	const p = quotes.map((q) => q.price);
	const cost = PARAMS.cost_bps / 1e4;
	let equity = 1;
	let peak = 1;
	let maxdd = 0;
	let pos = 0;
	let entry = 0;
	let lock: -1 | 0 | 1 = 0; // after a stop, stay flat while the signal points the same way
	const trades: Trade[] = [];
	const curve: number[] = [1];
	const move = (i: number, to: number, reason: Trade["reason"]) => {
		if (to === pos) return;
		const q = quotes[i];
		equity *= 1 - Math.abs(to - pos) * cost;
		trades.push({ strategy: id, market: q.market, quote_id: q.id, block: q.block, ts: q.ts, price: q.price, from: pos, to, reason });
		pos = to;
		entry = p[i];
	};
	for (let i = start; i < quotes.length - 1; i++) {
		let dir = signal(g, p, i);
		if (dir === null) dir = pos > 0 ? 1 : pos < 0 ? -1 : 0;
		if (lock !== 0 && dir === lock) dir = 0;
		else lock = 0;
		if (pos !== 0) {
			const adverse = pos > 0 ? ((entry - p[i]) / entry) * 1e4 : ((p[i] - entry) / entry) * 1e4;
			if (adverse > g.stop_bps) {
				lock = pos > 0 ? 1 : -1;
				move(i, 0, "stop");
				dir = 0;
			}
		}
		move(i, round(dir * g.size, 1e4), "signal");
		equity *= 1 + pos * ((p[i + 1] - p[i]) / p[i]);
		if (equity > peak) peak = equity;
		const dd = (peak - equity) / peak;
		if (dd > maxdd) maxdd = dd;
		curve.push(round(equity, 1e6));
	}
	if (close && pos !== 0) move(quotes.length - 1, 0, "close");
	return { ret: round(equity - 1), maxdd: round(maxdd), trades, equity: curve, pos };
}

export function baseline(quotes: Quote[], start: number): Baseline {
	const cost = PARAMS.cost_bps / 1e4;
	const p0 = quotes[start].price;
	let peak = p0;
	let maxdd = 0;
	for (let i = start; i < quotes.length; i++) {
		if (quotes[i].price > peak) peak = quotes[i].price;
		const dd = (peak - quotes[i].price) / peak;
		if (dd > maxdd) maxdd = dd;
	}
	const ret = round((quotes[quotes.length - 1].price / p0) * (1 - cost) * (1 - cost) - 1);
	return { ret, maxdd: round(maxdd), fitness: fitness(ret, maxdd) };
}

export const fitness = (ret: number, maxdd: number, trades = 1) =>
	trades === 0 ? -PARAMS.idle_penalty : round(ret - PARAMS.dd_weight * maxdd);

// ---------- genesis & mutation ----------

function randomGenome(r: () => number, kind: Kind, market: Market): Genome {
	const [l0, l1] = BOUNDS.lookback;
	return {
		kind,
		market,
		lookback: l0 + Math.floor(r() * (l1 - l0 + 1)),
		threshold_bps: Math.floor(r() * 21),
		size: round(0.25 + Math.floor(r() * 16) * 0.05, 100),
		stop_bps: 40 + Math.floor(r() * 161),
	};
}

export async function genesis(): Promise<Member[]> {
	const r = rng(await seedFor(GENESIS_HASH, 0));
	return Array.from({ length: PARAMS.pop }, (_, i) => ({
		id: memberId(1, i + 1),
		genome: randomGenome(r, KINDS[Math.floor(i / 2) % KINDS.length], MARKET_IDS[i % MARKET_IDS.length]),
		parent: null,
		born: 1,
	}));
}

export function mutate(parent: Genome, r: () => number): { genome: Genome; diffs: Diff[] } {
	const g: Genome = { ...parent };
	if (r() < 0.12) {
		const others = KINDS.filter((k) => k !== g.kind);
		g.kind = others[Math.floor(r() * others.length)];
	}
	if (r() < 0.04) g.market = MARKET_IDS.find((m) => m !== g.market)!;
	if (r() < 0.5) {
		const span = Math.max(2, Math.floor(g.lookback * 0.3));
		g.lookback = clamp(g.lookback + Math.round((r() * 2 - 1) * span), ...BOUNDS.lookback);
	}
	if (r() < 0.5) g.threshold_bps = clamp(g.threshold_bps + Math.round((r() * 2 - 1) * 8), ...BOUNDS.threshold_bps);
	if (r() < 0.4) g.size = round(clamp(g.size + (r() < 0.5 ? -1 : 1) * (r() < 0.5 ? 0.05 : 0.1), ...BOUNDS.size), 100);
	if (r() < 0.4) g.stop_bps = clamp(g.stop_bps + Math.round((r() * 2 - 1) * 60), ...BOUNDS.stop_bps);
	let diffs = diffOf(parent, g);
	if (diffs.length === 0) {
		g.lookback = g.lookback < BOUNDS.lookback[1] ? g.lookback + 1 : g.lookback - 1;
		diffs = diffOf(parent, g);
	}
	return { genome: g, diffs };
}

function diffOf(a: Genome, b: Genome): Diff[] {
	return (Object.keys(a) as (keyof Genome)[]).filter((k) => a[k] !== b[k]).map((k) => ({ field: k, from: a[k], to: b[k] }));
}

/** Offspring per survivor rank: rank 1–2 get three, 3–4 two, 5–6 one. Others carry over without offspring. */
export const OFFSPRING = [3, 3, 2, 2, 1, 1] as const;

// ---------- one generation ----------

export type GenerationInput = {
	n: number;
	prev_hash: string;
	population: Member[];
	/** Per market: warmup quotes followed by the window quotes, oldest first. */
	quotes: Record<Market, Quote[]>;
};

export type GenerationOutput = { record: GenerationRecord; hash: string; trades: Trade[] };

export async function runGeneration(input: GenerationInput): Promise<GenerationOutput> {
	const { n, prev_hash, population } = input;
	const seed = await seedFor(prev_hash, n);
	const r = rng(seed);

	const window = {} as Record<Market, Window>;
	const base = {} as Record<Market, Baseline>;
	const starts = {} as Record<Market, number>;
	for (const m of MARKET_IDS) {
		const qs = input.quotes[m];
		if (qs.length !== PARAMS.warmup + PARAMS.gen_ticks) throw new Error(`${m}: expected ${PARAMS.warmup + PARAMS.gen_ticks} quotes, got ${qs.length}`);
		const s = PARAMS.warmup;
		starts[m] = s;
		const w = qs.slice(s);
		window[m] = {
			from_id: w[0].id,
			to_id: w[w.length - 1].id,
			from_block: w[0].block,
			to_block: w[w.length - 1].block,
			start_ts: w[0].ts,
			end_ts: w[w.length - 1].ts,
			warmup_from_id: qs[0].id,
			quotes_hash: await quotesHash(qs),
		};
		base[m] = baseline(qs, s);
	}

	const trades: Trade[] = [];
	const scored = population.map((mem) => {
		const sim = simulate(mem.id, mem.genome, input.quotes[mem.genome.market], starts[mem.genome.market]);
		trades.push(...sim.trades);
		return { id: mem.id, ret: sim.ret, maxdd: sim.maxdd, fitness: fitness(sim.ret, sim.maxdd, sim.trades.length), trades: sim.trades.length };
	});
	scored.sort((a, b) => b.fitness - a.fitness || (a.id < b.id ? -1 : 1));
	const keep = Math.floor(population.length / 2);
	const results: Result[] = scored.map((s, i) => ({ ...s, rank: i + 1, outcome: i < keep ? "survived" : "culled" }));

	const byId = new Map(population.map((p) => [p.id, p]));
	const offspring: Offspring[] = [];
	let k = 1;
	results.slice(0, OFFSPRING.length).forEach((res, i) => {
		for (let c = 0; c < OFFSPRING[i]; c++) {
			const { genome, diffs } = mutate(byId.get(res.id)!.genome, r);
			offspring.push({ id: memberId(n + 1, k++), parent: res.id, genome, diffs });
		}
	});

	const winners = results.filter((x) => {
		const m = byId.get(x.id)!.genome.market;
		return x.ret > 0 && x.fitness > base[m].fitness;
	});
	const isNull = winners.length === 0;
	const best = results[0];

	const record: GenerationRecord = {
		v: 1,
		n,
		engine: ENGINE_VERSION,
		prev_hash,
		seed,
		params: PARAMS,
		window,
		population,
		results,
		baseline: base,
		offspring,
		trades_hash: await tradesHash(trades),
		null: isNull,
		null_reason: isNull ? "No strategy had a positive return and a fitness above its market's hold baseline." : null,
		best: { id: best.id, fitness: best.fitness, ret: best.ret },
	};
	return { record, hash: await hashRecord(record), trades };
}

/** Next generation's population: survivors plus offspring. */
export function nextPopulation(record: GenerationRecord): Member[] {
	const byId = new Map(record.population.map((p) => [p.id, p]));
	const survivors = record.results.filter((r) => r.outcome === "survived").map((r) => byId.get(r.id)!);
	return [...survivors, ...record.offspring.map((o) => ({ id: o.id, genome: o.genome, parent: o.parent, born: record.n + 1 }))];
}

// ---------- evidence thresholds ----------

export const THRESHOLDS = {
	min_generations: 24,
	positive_share: 0.6,
	max_drawdown: 0.03,
	min_trades: 20,
	beats_hold: true,
} as const;

/** Real execution is not live. No funds are traded. */
export const EXECUTION_LIVE = false;

export type Archive = {
	record: GenerationRecord;
	hash: string;
	quotes: Record<Market, Quote[]>;
	trades: Trade[];
};

export type ReplayCheck = { name: string; ok: boolean; detail: string };

/** Recompute a generation from its archive and compare every output. */
export async function replay(a: Archive): Promise<{ ok: boolean; checks: ReplayCheck[] }> {
	const checks: ReplayCheck[] = [];
	const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
	for (const m of MARKET_IDS) {
		const bad = a.quotes[m].filter((q) => priceFromSqrt(q.sqrt_price, m) !== q.price);
		add(`${m} prices match sqrtPriceX96`, bad.length === 0, bad.length ? `${bad.length} quotes differ` : `${a.quotes[m].length} quotes`);
	}
	add("Hash of the published record", (await hashRecord(a.record)) === a.hash, a.hash);
	const out = await runGeneration({ n: a.record.n, prev_hash: a.record.prev_hash, population: a.record.population, quotes: a.quotes });
	add("Seed from the previous hash", out.record.seed === a.record.seed, out.record.seed);
	for (const m of MARKET_IDS) add(`${m} quotes hash`, out.record.window[m].quotes_hash === a.record.window[m].quotes_hash, out.record.window[m].quotes_hash.slice(0, 16));
	add("Results (return, drawdown, fitness, rank)", canonical(out.record.results) === canonical(a.record.results), `${out.record.results.length} strategies`);
	add("Culls and survivors", canonical(out.record.results.map((r) => r.outcome)) === canonical(a.record.results.map((r) => r.outcome)), `${out.record.results.filter((r) => r.outcome === "culled").length} culled`);
	add("Offspring and mutations", canonical(out.record.offspring) === canonical(a.record.offspring), `${out.record.offspring.length} offspring`);
	add("Paper trades", out.record.trades_hash === a.record.trades_hash && canonical(out.trades) === canonical(a.trades), `${out.trades.length} trades`);
	add("Null result flag", out.record.null === a.record.null, a.record.null ? "null generation" : "not null");
	add("Recomputed hash", out.hash === a.hash, out.hash);
	return { ok: checks.every((c) => c.ok), checks };
}
