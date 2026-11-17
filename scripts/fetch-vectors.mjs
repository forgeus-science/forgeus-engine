// Download generation archives from the public API into vectors/.
// Usage: node scripts/fetch-vectors.mjs 1 2 3 27
import fs from "node:fs";
const API = process.env.FORGEUS_API ?? "https://dapp.forgeus.science";
const ns = process.argv.slice(2);
if (!ns.length) throw new Error("usage: fetch-vectors.mjs <n> [n...]");
for (const n of ns) {
  const res = await fetch(`${API}/v1/generations/${n}/archive`);
  if (!res.ok) throw new Error(`archive ${n}: HTTP ${res.status}`);
  const a = await res.json();
  fs.writeFileSync(new URL(`../vectors/gen-${String(n).padStart(4, "0")}.json`, import.meta.url), JSON.stringify(a, null, 1) + "\n");
  console.log(`gen ${n} -> ${a.hash}`);
}
