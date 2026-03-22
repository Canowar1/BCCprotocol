import { createPublicClient, http, keccak256 } from "viem";
import { baseSepolia } from "viem/chains";
import { REGISTRY_ABI } from "../abi.js";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CommitData {
  snapshotHash: `0x${string}`;
  previousHash: `0x${string}`;
  timestamp:    bigint;
  agentId:      `0x${string}`;
  riskScore:    number;
  driftFlagged: boolean;
  ipfsCid:      `0x${string}`;
}

// ── Verifier ───────────────────────────────────────────────────────────────────

export class Verifier {
  private contractAddress: `0x${string}`;
  private rpcUrl: string;

  constructor(opts: { contractAddress: `0x${string}`; rpcUrl?: string }) {
    this.contractAddress = opts.contractAddress;
    this.rpcUrl = opts.rpcUrl ?? "https://sepolia.base.org";
  }

  async printChainSummary(agentId: string): Promise<void> {
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(this.rpcUrl),
    });

    const agentIdHash = keccak256(new TextEncoder().encode(agentId)) as `0x${string}`;

    // Check operator
    const operator = await client.readContract({
      address: this.contractAddress,
      abi: REGISTRY_ABI,
      functionName: "operators",
      args: [agentIdHash],
    }) as `0x${string}`;

    const totalEpochs = Number(
      await client.readContract({
        address: this.contractAddress,
        abi: REGISTRY_ABI,
        functionName: "latestEpoch",
        args: [agentIdHash],
      })
    );

    if (totalEpochs === 0) {
      console.log(`No commits found for agent: ${agentId}`);
      return;
    }

    // Fetch all commits
    const commits: CommitData[] = [];
    for (let i = 0; i < totalEpochs; i++) {
      const result = await client.readContract({
        address: this.contractAddress,
        abi: REGISTRY_ABI,
        functionName: "getCommit",
        args: [agentIdHash, BigInt(i)],
      }) as [
        `0x${string}`, // snapshotHash
        `0x${string}`, // previousHash
        bigint,         // timestamp
        `0x${string}`, // agentId
        number,         // riskScore
        boolean,        // driftFlagged
        `0x${string}`, // ipfsCid
      ];

      commits.push({
        snapshotHash: result[0],
        previousHash: result[1],
        timestamp:    result[2],
        agentId:      result[3],
        riskScore:    result[4],
        driftFlagged: result[5],
        ipfsCid:      result[6],
      });
    }

    // Verify chain integrity
    let chainIntact = true;
    if (totalEpochs > 1) {
      chainIntact = await client.readContract({
        address: this.contractAddress,
        abi: REGISTRY_ABI,
        functionName: "verifyChain",
        args: [agentIdHash, 0n, BigInt(totalEpochs - 1)],
      }) as boolean;
    }

    // Print summary
    console.log("\n┌──────────────────────────────────────────────────────────────────────────┐");
    console.log("│                       BCC Chain Verification                             │");
    console.log("├───────┬────────────────────┬──────────────┬─────┬───────┬────────────────┤");
    console.log("│ Epoch │ Timestamp          │ SnapshotHash │ Risk│ Drift │ IPFS           │");
    console.log("├───────┼────────────────────┼──────────────┼─────┼───────┼────────────────┤");

    const ZERO_HASH = "0x" + "0".repeat(64);

    for (let i = 0; i < commits.length; i++) {
      const c = commits[i]!;
      const time = new Date(Number(c.timestamp) * 1000).toISOString().slice(0, 19);
      const hash = c.snapshotHash.slice(0, 14) + "..";
      const drift = c.driftFlagged ? "DRIFT" : "clean";
      const ipfs = c.ipfsCid === ZERO_HASH ? "n/a" : c.ipfsCid.slice(0, 14) + "..";
      console.log(
        `│ ${String(i).padStart(5)} │ ${time} │ ${hash} │ ${String(c.riskScore).padStart(3)} │ ${drift.padEnd(5)} │ ${ipfs.padEnd(14)} │`
      );
    }

    console.log("└───────┴────────────────────┴──────────────┴─────┴───────┴────────────────┘");
    console.log(`\n  Operator:        ${operator}`);
    console.log(`  Chain integrity: ${chainIntact ? "INTACT" : "BROKEN"}`);
    console.log(`  Total epochs:    ${totalEpochs}`);
    console.log(`  Drift detected:  ${commits.some(c => c.driftFlagged) ? "YES" : "NO"}`);
    console.log(`  BaseScan:        https://sepolia.basescan.org/address/${this.contractAddress}`);
  }
}
