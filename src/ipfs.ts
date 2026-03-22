import { keccak256 } from "viem";

/**
 * IPFS Snapshot Storage
 *
 * Two modes:
 * 1. If PINATA_JWT is set → real IPFS pinning via Pinata API
 * 2. Otherwise → local hash simulation (keccak256 of snapshot JSON)
 *
 * Both return a bytes32 content identifier stored on-chain.
 */

export interface SnapshotPayload {
  agentId:        string;
  epoch:          number;
  timestamp:      number;
  toolCallHashes: string[];
  intentHash:     string;
  outputClass:    string;
  riskScore:      number;
  previousHash:   string;
  similarity?:    number;
  driftFlagged?:  boolean;
}

export async function uploadSnapshot(payload: SnapshotPayload): Promise<`0x${string}`> {
  const json = JSON.stringify(payload, null, 2);

  if (process.env.PINATA_JWT) {
    return await pinToIPFS(json, `bcc-epoch-${payload.epoch}`);
  }

  // Fallback: deterministic hash as CID placeholder
  console.log("    [IPFS] No PINATA_JWT — using hash-based CID simulation");
  return keccak256(new TextEncoder().encode(json)) as `0x${string}`;
}

async function pinToIPFS(content: string, name: string): Promise<`0x${string}`> {
  const blob = new Blob([content], { type: "application/json" });
  const formData = new FormData();
  formData.append("file", blob, `${name}.json`);
  formData.append("pinataMetadata", JSON.stringify({ name }));

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PINATA_JWT}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Pinata upload failed: ${response.status} ${err}`);
  }

  const result = await response.json() as { IpfsHash: string };
  const cid = result.IpfsHash;

  console.log(`    [IPFS] Pinned: https://gateway.pinata.cloud/ipfs/${cid}`);

  // Convert CID string to bytes32 for on-chain storage
  return keccak256(new TextEncoder().encode(cid)) as `0x${string}`;
}
