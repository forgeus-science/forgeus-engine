// Walk every published generation back to genesis and check the links.
import { GENESIS_HASH } from "../src/engine.ts";
const API = process.env.FORGEUS_API ?? "https://dapp.forgeus.science";
const items = [];
let before = "";
for (;;) {
  const page = await (await fetch(`${API}/v1/generations?limit=100${before}`)).json();
  items.push(...page.items);
  if (page.items.length < 100) break;
  before = `&before=${page.items[page.items.length - 1].n}`;
}
items.sort((a, b) => a.n - b.n);
let ok = items.length > 0 && items[0].n === 1 && items[0].prev_hash === GENESIS_HASH;
for (let i = 1; i < items.length; i++) {
  if (items[i].n !== items[i - 1].n + 1 || items[i].prev_hash !== items[i - 1].hash) {
    console.log(`FAIL link ${items[i - 1].n} -> ${items[i].n}`);
    ok = false;
  }
}
console.log(ok ? `chain ok: ${items.length} generations, tip ${items.at(-1).hash}` : "chain BROKEN");
process.exit(ok ? 0 : 1);
