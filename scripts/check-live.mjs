// Check that the engine the app serves is byte-identical to src/engine.ts.
import fs from "node:fs";
import { createHash } from "node:crypto";
const API = process.env.FORGEUS_API ?? "https://dapp.forgeus.science";
const h = (b) => createHash("sha256").update(b).digest("hex");
const local = fs.readFileSync(new URL("../src/engine.ts", import.meta.url));
const live = Buffer.from(await (await fetch(`${API}/engine.ts`, { cache: "no-store" })).arrayBuffer());
console.log("repo ", h(local));
console.log("live ", h(live));
const same = Buffer.compare(local, live) === 0;
console.log(same ? "the app serves this engine" : "MISMATCH: the app serves a different engine");
process.exit(same ? 0 : 1);
