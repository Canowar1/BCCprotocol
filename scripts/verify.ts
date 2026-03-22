/**
 * BCC Protocol — Standalone Chain Verifier
 *
 * Usage:
 *   npx tsx scripts/verify.ts [agentId]
 *
 * Default agentId: bcc-demo-agent-35299
 * Anyone can run this — no private key needed, read-only.
 */

import * as dotenv from "dotenv";
import { Verifier } from "../src/verifier/Verifier.js";

dotenv.config({ override: true });

const CONTRACT_ADDRESS = process.env.BCC_REGISTRY_ADDRESS as `0x${string}` | undefined;
const RPC_URL = process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org";

async function main() {
  if (!CONTRACT_ADDRESS) {
    console.error("ERROR: BCC_REGISTRY_ADDRESS not set in .env");
    process.exit(1);
  }

  const agentId = process.argv[2] ?? "bcc-demo-agent-35299";

  console.log("\nBCC Protocol — Chain Verifier (read-only)\n");
  console.log(`  Contract: ${CONTRACT_ADDRESS}`);
  console.log(`  Agent:    ${agentId}`);
  console.log(`  RPC:      ${RPC_URL}`);

  const verifier = new Verifier({ contractAddress: CONTRACT_ADDRESS, rpcUrl: RPC_URL });
  await verifier.printChainSummary(agentId);

  console.log("\nAnyone can independently verify this chain.");
  console.log(`Sourcify:  https://repo.sourcify.dev/contracts/full_match/84532/${CONTRACT_ADDRESS}/\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
