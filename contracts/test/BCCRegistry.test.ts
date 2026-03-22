import { expect } from "chai";
import hre from "hardhat";
import { keccak256, toBytes } from "viem";

describe("BCCRegistry", function () {
  async function deployFixture() {
    const [owner, stranger] = await hre.ethers.getSigners();
    const BCCRegistry = await hre.ethers.getContractFactory("BCCRegistry");
    const registry = await BCCRegistry.deploy();
    await registry.waitForDeployment();

    const agentId = keccak256(toBytes("bcc-demo-agent-35299"));
    const genesisHash = "0x" + "0".repeat(64);
    const dummyIpfs = keccak256(toBytes("ipfs-cid-placeholder"));

    return { registry, owner, stranger, agentId, genesisHash, dummyIpfs };
  }

  describe("registerAgent", function () {
    it("should register an agent operator", async function () {
      const { registry, owner, agentId } = await deployFixture();

      await expect(registry.registerAgent(agentId))
        .to.emit(registry, "AgentRegistered")
        .withArgs(agentId, owner!.address);

      expect(await registry.operators(agentId)).to.equal(owner!.address);
    });

    it("should reject duplicate registration", async function () {
      const { registry, agentId } = await deployFixture();
      await registry.registerAgent(agentId);

      await expect(
        registry.registerAgent(agentId)
      ).to.be.revertedWithCustomError(registry, "AgentAlreadyRegistered");
    });
  });

  describe("addCommit — access control", function () {
    it("should reject commits from unregistered agents", async function () {
      const { registry, agentId, genesisHash, dummyIpfs } = await deployFixture();
      const snapshotHash = keccak256(toBytes("snapshot-0"));

      await expect(
        registry.addCommit(agentId, snapshotHash, genesisHash, 10, false, dummyIpfs)
      ).to.be.revertedWithCustomError(registry, "AgentNotRegistered");
    });

    it("should reject commits from non-operator address", async function () {
      const { registry, stranger, agentId, genesisHash, dummyIpfs } = await deployFixture();
      await registry.registerAgent(agentId); // owner registers

      const snapshotHash = keccak256(toBytes("snapshot-0"));
      await expect(
        registry.connect(stranger!).addCommit(agentId, snapshotHash, genesisHash, 10, false, dummyIpfs)
      ).to.be.revertedWithCustomError(registry, "NotOperator");
    });
  });

  describe("addCommit — chain logic", function () {
    it("should accept genesis commit with zero previousHash", async function () {
      const { registry, agentId, genesisHash, dummyIpfs } = await deployFixture();
      await registry.registerAgent(agentId);

      const snapshotHash = keccak256(toBytes("snapshot-0"));
      await expect(
        registry.addCommit(agentId, snapshotHash, genesisHash, 10, false, dummyIpfs)
      ).to.not.be.reverted;

      expect(await registry.latestEpoch(agentId)).to.equal(1n);
    });

    it("should reject genesis commit with non-zero previousHash", async function () {
      const { registry, agentId, dummyIpfs } = await deployFixture();
      await registry.registerAgent(agentId);

      const snapshotHash = keccak256(toBytes("snapshot-0"));
      const badPrevHash = keccak256(toBytes("bad-previous"));

      await expect(
        registry.addCommit(agentId, snapshotHash, badPrevHash, 10, false, dummyIpfs)
      ).to.be.revertedWithCustomError(registry, "InvalidPreviousHash");
    });

    it("should accept second commit with correct previousHash", async function () {
      const { registry, agentId, genesisHash, dummyIpfs } = await deployFixture();
      await registry.registerAgent(agentId);

      const snap0 = keccak256(toBytes("snapshot-0"));
      const snap1 = keccak256(toBytes("snapshot-1"));

      await registry.addCommit(agentId, snap0, genesisHash, 10, false, dummyIpfs);
      await expect(
        registry.addCommit(agentId, snap1, snap0, 15, false, dummyIpfs)
      ).to.not.be.reverted;

      expect(await registry.latestEpoch(agentId)).to.equal(2n);
    });

    it("should reject second commit with wrong previousHash", async function () {
      const { registry, agentId, genesisHash, dummyIpfs } = await deployFixture();
      await registry.registerAgent(agentId);

      const snap0 = keccak256(toBytes("snapshot-0"));
      const snap1 = keccak256(toBytes("snapshot-1"));
      const wrongPrev = keccak256(toBytes("wrong"));

      await registry.addCommit(agentId, snap0, genesisHash, 10, false, dummyIpfs);
      await expect(
        registry.addCommit(agentId, snap1, wrongPrev, 15, false, dummyIpfs)
      ).to.be.revertedWithCustomError(registry, "InvalidPreviousHash");
    });

    it("should emit CommitAdded event with riskScore and ipfsCid", async function () {
      const { registry, agentId, genesisHash, dummyIpfs } = await deployFixture();
      await registry.registerAgent(agentId);

      const snapshotHash = keccak256(toBytes("snapshot-0"));
      await expect(
        registry.addCommit(agentId, snapshotHash, genesisHash, 42, false, dummyIpfs)
      )
        .to.emit(registry, "CommitAdded")
        .withArgs(agentId, 0n, snapshotHash, 42, false, dummyIpfs);
    });

    it("should emit DriftDetected event when driftFlagged is true", async function () {
      const { registry, agentId, genesisHash, dummyIpfs } = await deployFixture();
      await registry.registerAgent(agentId);

      const snapshotHash = keccak256(toBytes("snapshot-drift"));
      await expect(
        registry.addCommit(agentId, snapshotHash, genesisHash, 85, true, dummyIpfs)
      )
        .to.emit(registry, "DriftDetected")
        .withArgs(agentId, 0n, 85);
    });
  });

  describe("verifyChain", function () {
    it("should return true for a valid chain of 3 commits", async function () {
      const { registry, agentId, genesisHash, dummyIpfs } = await deployFixture();
      await registry.registerAgent(agentId);

      const snap0 = keccak256(toBytes("s0"));
      const snap1 = keccak256(toBytes("s1"));
      const snap2 = keccak256(toBytes("s2"));

      await registry.addCommit(agentId, snap0, genesisHash, 5, false, dummyIpfs);
      await registry.addCommit(agentId, snap1, snap0, 10, false, dummyIpfs);
      await registry.addCommit(agentId, snap2, snap1, 80, true, dummyIpfs);

      expect(await registry.verifyChain(agentId, 0n, 2n)).to.equal(true);
    });

    it("should revert for agents with no commits", async function () {
      const { registry } = await deployFixture();
      const unknownAgent = keccak256(toBytes("unknown-agent"));

      await expect(
        registry.verifyChain(unknownAgent, 0n, 1n)
      ).to.be.revertedWithCustomError(registry, "NoCommitsForAgent");
    });

    it("should revert when range exceeds MAX_VERIFY_RANGE", async function () {
      const { registry, agentId, genesisHash, dummyIpfs } = await deployFixture();
      await registry.registerAgent(agentId);

      const snap0 = keccak256(toBytes("s0"));
      await registry.addCommit(agentId, snap0, genesisHash, 5, false, dummyIpfs);

      await expect(
        registry.verifyChain(agentId, 0n, 101n)
      ).to.be.revertedWithCustomError(registry, "EpochRangeExceedsLimit");
    });
  });

  describe("hasDriftInRange", function () {
    it("should return true when drift exists in range", async function () {
      const { registry, agentId, genesisHash, dummyIpfs } = await deployFixture();
      await registry.registerAgent(agentId);

      const snap0 = keccak256(toBytes("s0"));
      const snap1 = keccak256(toBytes("s1"));

      await registry.addCommit(agentId, snap0, genesisHash, 5, false, dummyIpfs);
      await registry.addCommit(agentId, snap1, snap0, 85, true, dummyIpfs);

      expect(await registry.hasDriftInRange(agentId, 0n, 1n)).to.equal(true);
    });

    it("should return false for clean range", async function () {
      const { registry, agentId, genesisHash, dummyIpfs } = await deployFixture();
      await registry.registerAgent(agentId);

      const snap0 = keccak256(toBytes("s0"));
      const snap1 = keccak256(toBytes("s1"));

      await registry.addCommit(agentId, snap0, genesisHash, 5, false, dummyIpfs);
      await registry.addCommit(agentId, snap1, snap0, 10, false, dummyIpfs);

      expect(await registry.hasDriftInRange(agentId, 0n, 1n)).to.equal(false);
    });
  });

  describe("getCommit", function () {
    it("should return stored commit data including ipfsCid", async function () {
      const { registry, agentId, genesisHash, dummyIpfs } = await deployFixture();
      await registry.registerAgent(agentId);

      const snapshotHash = keccak256(toBytes("snapshot-data"));
      await registry.addCommit(agentId, snapshotHash, genesisHash, 42, false, dummyIpfs);

      const commit = await registry.getCommit(agentId, 0n);
      expect(commit.snapshotHash).to.equal(snapshotHash);
      expect(commit.previousHash).to.equal(genesisHash);
      expect(commit.agentId).to.equal(agentId);
      expect(commit.riskScore).to.equal(42);
      expect(commit.driftFlagged).to.equal(false);
      expect(commit.ipfsCid).to.equal(dummyIpfs);
    });
  });
});
