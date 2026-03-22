// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BCCRegistry — Behavioral Commitment Chain Registry
/// @notice Stores tamper-proof behavioral state commitments for autonomous AI agents.
/// @dev Each commit is chained via previousHash, creating an immutable behavioral history.
///      Only the registered operator of an agent can add commits (operator access control).
contract BCCRegistry {

    /// @notice Maximum epoch range for verifyChain to prevent DoS
    uint256 public constant MAX_VERIFY_RANGE = 100;

    /// @notice A single behavioral commitment
    struct Commit {
        bytes32 snapshotHash;  /// keccak256 of off-chain behavioral snapshot
        bytes32 previousHash;  /// links to prior commit — genesis = bytes32(0)
        uint256 timestamp;     /// block timestamp
        bytes32 agentId;       /// keccak256 of ERC-8004 identity
        uint8   riskScore;     /// 0-100, computed by BCC Engine
        bool    driftFlagged;  /// true if Drift Detector fired
        bytes32 ipfsCid;       /// IPFS CID of off-chain snapshot content
    }

    /// @notice agentId => epoch => Commit
    mapping(bytes32 => mapping(uint256 => Commit)) public commits;

    /// @notice agentId => next epoch number
    mapping(bytes32 => uint256) public latestEpoch;

    /// @notice agentId => whether genesis commit exists
    mapping(bytes32 => bool) public hasGenesis;

    /// @notice agentId => registered operator address
    mapping(bytes32 => address) public operators;

    // ── Events ────────────────────────────────────────────────────────────────

    event AgentRegistered(
        bytes32 indexed agentId,
        address indexed operator
    );

    event CommitAdded(
        bytes32 indexed agentId,
        uint256 indexed epoch,
        bytes32 snapshotHash,
        uint8   riskScore,
        bool    driftFlagged,
        bytes32 ipfsCid
    );

    event DriftDetected(
        bytes32 indexed agentId,
        uint256 indexed epoch,
        uint8   riskScore
    );

    // ── Errors ────────────────────────────────────────────────────────────────

    error InvalidPreviousHash(bytes32 expected, bytes32 provided);
    error EpochRangeExceedsLimit(uint256 range, uint256 maxRange);
    error NoCommitsForAgent(bytes32 agentId);
    error AgentAlreadyRegistered(bytes32 agentId);
    error NotOperator(bytes32 agentId, address caller);
    error AgentNotRegistered(bytes32 agentId);

    // ── Agent Registration ──────────────────────────────────────────────────

    /// @notice Register as the operator for an agent. First-come, first-served.
    /// @param agentId keccak256 of the agent's ERC-8004 identity string
    function registerAgent(bytes32 agentId) external {
        if (operators[agentId] != address(0)) {
            revert AgentAlreadyRegistered(agentId);
        }
        operators[agentId] = msg.sender;
        emit AgentRegistered(agentId, msg.sender);
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /// @notice Add a new behavioral commitment to an agent's chain.
    /// @dev Only the registered operator can call this.
    /// @param agentId       keccak256 of the agent's ERC-8004 identity string
    /// @param snapshotHash  keccak256 of the off-chain behavioral snapshot
    /// @param previousHash  must be bytes32(0) for genesis, or last snapshotHash otherwise
    /// @param riskScore     0-100 risk score from BCC Engine
    /// @param driftFlagged  true if Drift Detector detected behavioral drift
    /// @param ipfsCid       IPFS CID where the full snapshot is stored
    function addCommit(
        bytes32 agentId,
        bytes32 snapshotHash,
        bytes32 previousHash,
        uint8   riskScore,
        bool    driftFlagged,
        bytes32 ipfsCid
    ) external {
        // Operator access control
        if (operators[agentId] == address(0)) {
            revert AgentNotRegistered(agentId);
        }
        if (operators[agentId] != msg.sender) {
            revert NotOperator(agentId, msg.sender);
        }

        uint256 epoch = latestEpoch[agentId];

        if (!hasGenesis[agentId]) {
            // Genesis: previousHash MUST be zero
            if (previousHash != bytes32(0)) {
                revert InvalidPreviousHash(bytes32(0), previousHash);
            }
            hasGenesis[agentId] = true;
        } else {
            // Non-genesis: previousHash MUST match last snapshotHash
            bytes32 expected = commits[agentId][epoch - 1].snapshotHash;
            if (previousHash != expected) {
                revert InvalidPreviousHash(expected, previousHash);
            }
        }

        commits[agentId][epoch] = Commit({
            snapshotHash: snapshotHash,
            previousHash: previousHash,
            timestamp:    block.timestamp,
            agentId:      agentId,
            riskScore:    riskScore,
            driftFlagged: driftFlagged,
            ipfsCid:      ipfsCid
        });

        latestEpoch[agentId]++;

        emit CommitAdded(agentId, epoch, snapshotHash, riskScore, driftFlagged, ipfsCid);

        if (driftFlagged) {
            emit DriftDetected(agentId, epoch, riskScore);
        }
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    /// @notice Retrieve a specific commit.
    function getCommit(bytes32 agentId, uint256 epoch)
        external view returns (Commit memory)
    {
        return commits[agentId][epoch];
    }

    /// @notice Verify that a range of commits form an unbroken chain.
    /// @return isIntact true if all previousHash pointers are valid
    function verifyChain(
        bytes32 agentId,
        uint256 fromEpoch,
        uint256 toEpoch
    ) external view returns (bool isIntact) {
        if (!hasGenesis[agentId]) revert NoCommitsForAgent(agentId);
        if (toEpoch - fromEpoch > MAX_VERIFY_RANGE) {
            revert EpochRangeExceedsLimit(toEpoch - fromEpoch, MAX_VERIFY_RANGE);
        }

        for (uint256 i = fromEpoch + 1; i <= toEpoch; i++) {
            Commit memory curr = commits[agentId][i];
            Commit memory prev = commits[agentId][i - 1];
            if (curr.previousHash != prev.snapshotHash) return false;
        }
        return true;
    }

    /// @notice Get the latest epoch number for an agent.
    function getLatestEpoch(bytes32 agentId) external view returns (uint256) {
        return latestEpoch[agentId];
    }

    /// @notice Check if any commit in a range was drift-flagged.
    function hasDriftInRange(
        bytes32 agentId,
        uint256 fromEpoch,
        uint256 toEpoch
    ) external view returns (bool) {
        if (toEpoch - fromEpoch > MAX_VERIFY_RANGE) {
            revert EpochRangeExceedsLimit(toEpoch - fromEpoch, MAX_VERIFY_RANGE);
        }
        for (uint256 i = fromEpoch; i <= toEpoch; i++) {
            if (commits[agentId][i].driftFlagged) return true;
        }
        return false;
    }
}
