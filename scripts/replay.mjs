// Replay one generation from the public API with the engine in this repo.
// Usage: node scripts/replay.mjs <n|latest>
import { replay } from "../src/engine.ts";
const API = process.env.FORGEUS_API ?? "https://dapp.forgeus.science";
let n = process.argv[2];
if (!n) throw new Error("usage: replay.mjs <n|latest>");
if (n === "latest") n = (await (await fetch(`${API}/v1/stats`)).json()).generations;
const res = await fetch(`${API}/v1/generations/${n}/archive`);
if (!res.ok) throw new Error(`archive ${n}: HTTP ${res.status}`);
const { ok, checks } = await replay(await res.json());
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, "|", c.detail);
console.log(ok ? `generation ${n} verified` : `generation ${n} did NOT verify`);
process.exit(ok ? 0 : 1);
