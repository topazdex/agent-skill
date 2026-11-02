// yarn sync:spoke-relays <path-to-xtopaz-relay> [--network <name>]
// Copies broadcast addresses from <repo>/deployments/<network>.json into
// references/spoke-relays.json. Chains without a broadcast manifest stay pending.

import minimist from "minimist";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SPOKE_RELAY_MANIFEST } from "../config/relays.js";
import { applySpokeRelayDeployment } from "../lib/spokeRelayManifest.js";
import { exitWithError } from "../lib/revertReason.js";

function main(): void {
  const argv = minimist(process.argv.slice(2), { string: ["_", "network"] });
  const repo = argv._[0];
  if (!repo) throw new Error("usage: yarn sync:spoke-relays <path-to-xtopaz-relay> [--network <name>]");
  const only = argv.network ? String(argv.network) : undefined;
  const chains = SPOKE_RELAY_MANIFEST.chains.map((chain) => {
    if (only && chain.network !== only) return chain;
    const file = resolve(repo, "deployments", `${chain.network}.json`);
    if (!existsSync(file)) {
      console.log(`${chain.network}: no broadcast manifest at ${file}; left ${chain.status}`);
      return chain;
    }
    const next = applySpokeRelayDeployment(chain, JSON.parse(readFileSync(file, "utf8")));
    console.log(`${chain.network}: ${next.relays.maxi.address} (#${next.relays.maxi.mTokenId}), ${next.relays.converter.address} (#${next.relays.converter.mTokenId}) at block ${next.deployBlock}`);
    return next;
  });
  const out = fileURLToPath(new URL("../../../references/spoke-relays.json", import.meta.url));
  writeFileSync(out, `${JSON.stringify({ ...SPOKE_RELAY_MANIFEST, chains }, null, 2)}\n`);
  console.log(`wrote ${out}; next: yarn test && yarn verify:deployments`);
}

try {
  main();
} catch (error) {
  exitWithError(error);
}
