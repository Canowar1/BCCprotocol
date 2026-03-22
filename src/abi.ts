import { parseAbi } from "viem";

export const REGISTRY_ABI = parseAbi([
  "function registerAgent(bytes32 agentId) external",
  "function addCommit(bytes32 agentId, bytes32 snapshotHash, bytes32 previousHash, uint8 riskScore, bool driftFlagged, bytes32 ipfsCid) external",
  "function latestEpoch(bytes32 agentId) external view returns (uint256)",
  "function getCommit(bytes32 agentId, uint256 epoch) external view returns (bytes32,bytes32,uint256,bytes32,uint8,bool,bytes32)",
  "function verifyChain(bytes32 agentId, uint256 fromEpoch, uint256 toEpoch) external view returns (bool)",
  "function hasDriftInRange(bytes32 agentId, uint256 fromEpoch, uint256 toEpoch) external view returns (bool)",
  "function operators(bytes32 agentId) external view returns (address)",
]);
