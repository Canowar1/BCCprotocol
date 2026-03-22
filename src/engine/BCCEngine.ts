import { keccak256, encodePacked, createPublicClient, createWalletClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { REGISTRY_ABI } from "../abi.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgentSignals {
  agentId:     string;           // ERC-8004 identity string
  toolCalls:   ToolCallRecord[]; // all tool calls in this epoch
  intentText:  string;           // agent's self-described intent for this epoch
  outputTexts: string[];         // agent outputs (will be hashed, never stored raw)
}

export interface ToolCallRecord {
  name:   string;
  input:  unknown;
  output: unknown;
}

export interface BehavioralSnapshot {
  agentId:        `0x${string}`;  // keccak256(agentId string)
  epoch:          number;
  timestamp:      number;
  toolCallHashes: string[];       // keccak256 of each tool call
  intentHash:     `0x${string}`; // keccak256 of intent embedding
  outputClass:    "benign" | "ambiguous" | "flagged";
  riskScore:      number;         // 0-100
  previousHash:   `0x${string}`;
}

export interface CommitResult {
  epoch:        number;
  snapshotHash: `0x${string}`;
  txHash:       `0x${string}`;
  driftFlagged: boolean;
}

export const GENESIS_HASH = `0x${"0".repeat(64)}` as `0x${string}`;

// ── BCC Engine ─────────────────────────────────────────────────────────────────

export class BCCEngine {
  private contractAddress: `0x${string}`;
  private privateKey: `0x${string}`;
  private rpcUrl: string;
  // Local cache to avoid stale RPC reads between sequential commits
  private lastCommitHash: Map<string, `0x${string}`> = new Map();
  private lastEpoch: Map<string, number> = new Map();
  // Local nonce management — Base Sepolia RPC returns stale nonces between back-to-back TXs
  private currentNonce: number | null = null;

  constructor(opts: {
    contractAddress: `0x${string}`;
    privateKey: `0x${string}`;
    rpcUrl?: string;
  }) {
    this.contractAddress = opts.contractAddress;
    this.privateKey      = opts.privateKey;
    this.rpcUrl          = opts.rpcUrl ?? "https://sepolia.base.org";
  }

  /**
   * Register this operator for the given agent on-chain.
   * Must be called once before any commits.
   */
  async registerAgent(agentId: string): Promise<`0x${string}`> {
    const agentIdHash = keccak256(new TextEncoder().encode(agentId)) as `0x${string}`;
    const { wallet, nonce } = await this.getWalletWithNonce();

    const txHash = await wallet.writeContract({
      address:      this.contractAddress,
      abi:          REGISTRY_ABI,
      functionName: "registerAgent",
      args:         [agentIdHash],
      nonce,
    });

    this.currentNonce = nonce + 1;
    const client = this.publicClient();
    await client.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }

  /**
   * Check if agent is already registered.
   */
  async isAgentRegistered(agentId: string): Promise<boolean> {
    const agentIdHash = keccak256(new TextEncoder().encode(agentId)) as `0x${string}`;
    const client = this.publicClient();
    const operator = await client.readContract({
      address:      this.contractAddress,
      abi:          REGISTRY_ABI,
      functionName: "operators",
      args:         [agentIdHash],
    }) as `0x${string}`;
    return operator !== "0x0000000000000000000000000000000000000000";
  }

  /**
   * Main entry point — snapshot agent signals and commit to chain.
   * Waits for TX receipt before returning.
   */
  async snapshot(
    signals: AgentSignals,
    driftFlagged: boolean,
    similarityScore: number,
    ipfsCid: `0x${string}` = GENESIS_HASH
  ): Promise<CommitResult> {
    const agentIdHash = keccak256(new TextEncoder().encode(signals.agentId)) as `0x${string}`;

    // Use cached values if available (avoids stale RPC reads), otherwise fetch from chain
    const previousHash = this.lastCommitHash.get(agentIdHash) ?? await this.getLatestHash(agentIdHash);
    const epoch        = this.lastEpoch.get(agentIdHash) ?? await this.getLatestEpoch(agentIdHash);

    // Build snapshot
    const snap = this.buildSnapshot(signals, agentIdHash, epoch, previousHash, driftFlagged, similarityScore);

    // Compute commitment hash
    const snapshotHash = this.computeHash(snap);

    // Commit on-chain and wait for confirmation
    const txHash = await this.commitToChain(
      agentIdHash,
      snapshotHash,
      previousHash,
      snap.riskScore,
      driftFlagged,
      ipfsCid
    );

    // Update local cache for next commit
    this.lastCommitHash.set(agentIdHash, snapshotHash);
    this.lastEpoch.set(agentIdHash, epoch + 1);

    return { epoch, snapshotHash, txHash, driftFlagged };
  }

  /**
   * Fetch the last committed snapshotHash for an agent (or GENESIS_HASH).
   */
  async getLatestHash(agentIdHash: `0x${string}`): Promise<`0x${string}`> {
    const client = this.publicClient();
    const epoch  = await client.readContract({
      address:      this.contractAddress,
      abi:          REGISTRY_ABI,
      functionName: "latestEpoch",
      args:         [agentIdHash],
    }) as bigint;

    if (epoch === 0n) return GENESIS_HASH;

    const commit = await client.readContract({
      address:      this.contractAddress,
      abi:          REGISTRY_ABI,
      functionName: "getCommit",
      args:         [agentIdHash, epoch - 1n],
    }) as [`0x${string}`, ...unknown[]];

    return commit[0];
  }

  private async getLatestEpoch(agentIdHash: `0x${string}`): Promise<number> {
    const client = this.publicClient();
    const epoch  = await client.readContract({
      address:      this.contractAddress,
      abi:          REGISTRY_ABI,
      functionName: "latestEpoch",
      args:         [agentIdHash],
    }) as bigint;
    return Number(epoch);
  }

  private buildSnapshot(
    signals:      AgentSignals,
    agentIdHash:  `0x${string}`,
    epoch:        number,
    previousHash: `0x${string}`,
    driftFlagged: boolean,
    similarity:   number
  ): BehavioralSnapshot {
    const toolCallHashes = signals.toolCalls.map(tc =>
      keccak256(new TextEncoder().encode(JSON.stringify({ name: tc.name, input: tc.input })))
    );

    const intentHash = keccak256(
      new TextEncoder().encode(signals.intentText)
    ) as `0x${string}`;

    const riskScore = driftFlagged
      ? Math.round((1 - similarity) * 100)
      : Math.round(signals.toolCalls.length * 2); // simple proxy for non-drift

    const outputClass: BehavioralSnapshot["outputClass"] =
      riskScore > 70 ? "flagged" :
      riskScore > 40 ? "ambiguous" :
      "benign";

    return {
      agentId:        agentIdHash,
      epoch,
      timestamp:      Math.floor(Date.now() / 1000),
      toolCallHashes,
      intentHash,
      outputClass,
      riskScore:      Math.min(100, Math.max(0, riskScore)),
      previousHash,
    };
  }

  private computeHash(snap: BehavioralSnapshot): `0x${string}` {
    return keccak256(
      encodePacked(
        ["bytes32", "uint256", "bytes32", "uint8", "bytes32"],
        [
          snap.agentId,
          BigInt(snap.epoch),
          snap.intentHash,
          snap.riskScore,
          snap.previousHash,
        ]
      )
    );
  }

  private async commitToChain(
    agentId:      `0x${string}`,
    snapshotHash: `0x${string}`,
    previousHash: `0x${string}`,
    riskScore:    number,
    driftFlagged: boolean,
    ipfsCid:      `0x${string}`
  ): Promise<`0x${string}`> {
    const { wallet, nonce } = await this.getWalletWithNonce();

    const txHash = await wallet.writeContract({
      address:      this.contractAddress,
      abi:          REGISTRY_ABI,
      functionName: "addCommit",
      args:         [agentId, snapshotHash, previousHash, riskScore, driftFlagged, ipfsCid],
      nonce,
    });

    this.currentNonce = nonce + 1;

    // Wait for TX to be mined before returning
    const client = this.publicClient();
    await client.waitForTransactionReceipt({ hash: txHash });

    return txHash;
  }

  /**
   * Get a wallet client with a locally-managed nonce.
   * On first call, fetches nonce from RPC. After that, uses local nonce.
   */
  private async getWalletWithNonce() {
    const account = privateKeyToAccount(this.privateKey);
    const wallet  = createWalletClient({
      account,
      chain:     baseSepolia,
      transport: http(this.rpcUrl),
    });

    if (this.currentNonce === null) {
      const client = this.publicClient();
      this.currentNonce = await client.getTransactionCount({ address: account.address });
    }

    return { wallet, nonce: this.currentNonce };
  }

  private publicClient() {
    return createPublicClient({ chain: baseSepolia, transport: http(this.rpcUrl) });
  }
}
