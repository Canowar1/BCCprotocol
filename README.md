# BCC Protocol

**Behavioral Commitment Chain** — tamper-proof behavioral integrity protocol for autonomous AI agents.

> An agent that passes 200 clean interactions then silently starts exfiltrating data on day 201 cannot rewrite its history. Any verifier can diff behavioral state at time T vs T-1 and detect the exact epoch where drift occurred.

## The Problem

Reputation systems track interaction *outcomes*, not behavioral *state*. A malicious agent can:
1. Build perfect reputation over 200 epochs
2. Silently change behavior at epoch 201
3. Delete or rewrite its behavioral history
4. No system detects the drift — reputation stays clean

## The Solution

BCC chains behavioral state snapshots using `previousHash` pointers (like a blockchain for agent behavior):

```
Epoch 0:  snapshotHash_0 = keccak256(behavioral_state_0)
          previousHash   = 0x000...000 (genesis)

Epoch 1:  snapshotHash_1 = keccak256(behavioral_state_1 + snapshotHash_0)
          previousHash   = snapshotHash_0

Epoch N:  snapshotHash_N = keccak256(behavioral_state_N + snapshotHash_{N-1})
```

The chain is immutable — rewriting epoch 201 breaks every subsequent hash. Verified on-chain with a single `verifyChain()` call.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Runtime                        │
│  (Anthropic SDK — claude-haiku-4-5-20251001)            │
│                                                         │
│  Every 10 interactions → signals to BCC Engine           │
└──────────────────────┬──────────────────────────────────┘
                       │
         ┌─────────────▼─────────────┐
         │       BCC Engine          │
         │  - buildSnapshot()        │
         │  - computeHash()          │
         │  - commitToChain()        │
         │  - waitForReceipt()       │
         └──┬──────────────┬─────────┘
            │              │
   ┌────────▼────┐   ┌─────▼──────────┐
   │  Drift      │   │  IPFS          │
   │  Detector   │   │  (Pinata /     │
   │  (cosine    │   │   simulated)   │
   │  similarity)│   └─────┬──────────┘
   └────────┬────┘         │
            │              │
   ┌────────▼──────────────▼─────────┐
   │     BCCRegistry.sol             │
   │     (Base Sepolia)              │
   │                                 │
   │  - registerAgent()              │
   │  - addCommit() [operator-only]  │
   │  - verifyChain()                │
   │  - hasDriftInRange()            │
   └─────────────────────────────────┘
```

## Live Contract

| Field | Value |
|---|---|
| Network | Base Sepolia |
| Address | `0x6276C0F6E664d8Ea8Da8FC05eEBff393b9EcAea2` |
| BaseScan | [View](https://sepolia.basescan.org/address/0x6276C0F6E664d8Ea8Da8FC05eEBff393b9EcAea2) |
| Sourcify | [Verified Source](https://repo.sourcify.dev/contracts/full_match/84532/0x6276C0F6E664d8Ea8Da8FC05eEBff393b9EcAea2/) |
| ERC-8004 ID | 35299 |
| Operator | `0xC61221100589071804EAf2927BA351706349cE95` |

## Demo: Gradual Drift Detection

The demo runs 5 epochs (10 interactions each), showing progressive behavioral drift:

```
Epoch 0: Clean — blockchain education           → benign (similarity: n/a)
Epoch 1: Clean — cryptography education         → benign (similarity: ~0.92)
Epoch 2: Subtle drift — security probing        → detected (similarity: ~0.65)
Epoch 3: Escalating — exploitation research     → DRIFT_ALERT (similarity: ~0.40)
Epoch 4: Full malicious — active exploitation   → DRIFT_ALERT (similarity: ~0.20)
```

Each commit is on-chain with `previousHash` linking to the prior epoch. The chain is verified intact — history cannot be rewritten.

## Quick Start

```bash
# Install
npm install

# Set up environment
cp .env.example .env
# Fill in: PRIVATE_KEY

# Compile & deploy
npm run compile
npm run deploy
# Copy the deployed address to .env as BCC_REGISTRY_ADDRESS

# Run demo
npm run demo

# Verify chain (anyone, read-only)
npx tsx scripts/verify.ts
```

## Project Structure

```
bcc-protocol/
├── contracts/src/BCCRegistry.sol     # On-chain commitment registry
├── contracts/test/                   # Hardhat tests (16 passing)
├── src/
│   ├── engine/BCCEngine.ts           # Snapshot + commit engine
│   ├── detector/DriftDetector.ts     # Cosine similarity drift detection
│   ├── verifier/Verifier.ts          # Chain verification + display
│   ├── ipfs.ts                       # IPFS snapshot storage
│   └── abi.ts                        # Shared contract ABI
├── agent/demo.ts                     # 5-epoch gradual drift demo
├── scripts/
│   ├── deploy.ts                     # Contract deployment
│   └── verify.ts                     # Standalone chain verifier
├── docs/
│   ├── agent.json                    # DevSpot Agent Manifest
│   └── agent_log.json                # Auto-generated execution log
└── WHY.md                            # Problem statement & vision
```

## Key Design Decisions

- **Operator access control**: Only the registered operator can write commits for an agent — prevents spam and impersonation
- **previousHash chaining**: Every commit references the prior snapshot hash — rewriting history breaks the chain
- **Hash-only on-chain**: Raw agent outputs never touch the blockchain — only keccak256 hashes and metadata
- **IPFS off-chain storage**: Full snapshot content stored off-chain, CID recorded on-chain
- **TX receipt waiting**: Engine waits for mining confirmation before proceeding — prevents race conditions
- **Drift threshold**: Cosine similarity < 0.85 between consecutive intent embeddings fires `DRIFT_ALERT`

## Testing

```bash
# Contract tests (Hardhat + Chai)
npm run test:contracts    # 16 tests

# Unit tests (Vitest)
npm test                  # 5 tests
```

## Stack

| Layer | Technology |
|---|---|
| Smart Contract | Solidity 0.8.20, Hardhat |
| Chain | Base Sepolia (EVM) |
| Hashing | keccak256 (viem) |
| Agent Runtime | Anthropic SDK (Claude Haiku) |
| Drift Detection | OpenAI Embeddings / trigram fallback |
| Off-chain Storage | IPFS (Pinata) |
| Identity | ERC-8004 Agent Registry |

## Hackathon

**The Synthesis** — `behavioral-commitment-chain-bcc-1078`

Tracks:
- Agents With Receipts — ERC-8004 (Protocol Labs)
- 🤖 Let the Agent Cook — No Humans Required (Protocol Labs)
- Synthesis Open Track

## License

MIT
