const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CrossChainVerifier", function () {
  let CrossChainVerifier;
  let verifier;
  let owner, relayer, sender, receiver, unauthorizedUser;

  const ORIGIN_CHAIN_ID = 11155111; // e.g., Ethereum Sepolia
  const TX_AMOUNT = ethers.parseEther("1.5");
  let sampleTxHash;

  beforeEach(async function () {
    [owner, relayer, sender, receiver, unauthorizedUser] = await ethers.getSigners();

    // Generate a unique sample transaction hash
    sampleTxHash = ethers.keccak256(ethers.toUtf8Bytes("sample-cross-chain-tx-001"));

    // Deploy contract with trustedRelayer address
    CrossChainVerifier = await ethers.getContractFactory("CrossChainVerifier");
    verifier = await CrossChainVerifier.deploy(relayer.address);
    await verifier.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right trustedRelayer address", async function () {
      expect(await verifier.trustedRelayer()).to.equal(relayer.address);
    });
  });

  describe("1. Registering Source Transactions (registerSourceTx)", function () {
    it("Should register a new transaction and emit TransactionRegistered event", async function () {
      await expect(
        verifier
          .connect(sender)
          .registerSourceTx(sampleTxHash, receiver.address, TX_AMOUNT, ORIGIN_CHAIN_ID)
      )
        .to.emit(verifier, "TransactionRegistered")
        .withArgs(sampleTxHash, ORIGIN_CHAIN_ID);

      const storedTx = await verifier.verifiedTransactions(sampleTxHash);
      expect(storedTx.txHash).to.equal(sampleTxHash);
      expect(storedTx.sender).to.equal(sender.address);
      expect(storedTx.receiver).to.equal(receiver.address);
      expect(storedTx.amount).to.equal(TX_AMOUNT);
      expect(storedTx.originChainId).to.equal(ORIGIN_CHAIN_ID);
      expect(storedTx.isVerified).to.equal(false);
    });

    it("Should revert if the same transaction hash is registered twice (Replay Protection)", async function () {
      await verifier
        .connect(sender)
        .registerSourceTx(sampleTxHash, receiver.address, TX_AMOUNT, ORIGIN_CHAIN_ID);

      await expect(
        verifier
          .connect(sender)
          .registerSourceTx(sampleTxHash, receiver.address, TX_AMOUNT, ORIGIN_CHAIN_ID)
      ).to.be.revertedWith("Tx already exists");
    });
  });

  describe("2. Verifying Cross-Chain Transactions (verifyCrossChainTx)", function () {
    beforeEach(async function () {
      // Register a transaction before testing verification
      await verifier
        .connect(sender)
        .registerSourceTx(sampleTxHash, receiver.address, TX_AMOUNT, ORIGIN_CHAIN_ID);
    });

    it("Should allow trustedRelayer to verify a transaction with a valid proof", async function () {
      const dummyCryptographicProof = ethers.toUtf8Bytes("valid-merkle-or-zk-proof-payload");

      await expect(
        verifier.connect(relayer).verifyCrossChainTx(sampleTxHash, dummyCryptographicProof)
      )
        .to.emit(verifier, "TransactionVerifiedOnDest")
        .withArgs(sampleTxHash, true);

      const storedTx = await verifier.verifiedTransactions(sampleTxHash);
      expect(storedTx.isVerified).to.equal(true);
    });

    it("Should emit success=false and keep isVerified=false if proof is empty", async function () {
      const emptyProof = "0x";

      await expect(verifier.connect(relayer).verifyCrossChainTx(sampleTxHash, emptyProof))
        .to.emit(verifier, "TransactionVerifiedOnDest")
        .withArgs(sampleTxHash, false);

      const storedTx = await verifier.verifiedTransactions(sampleTxHash);
      expect(storedTx.isVerified).to.equal(false);
    });

    it("Should revert if called by anyone other than trustedRelayer", async function () {
      const dummyProof = ethers.toUtf8Bytes("proof");

      await expect(
        verifier.connect(unauthorizedUser).verifyCrossChainTx(sampleTxHash, dummyProof)
      ).to.be.revertedWith("Only trusted relayer can call this");
    });

    it("Should revert if trying to verify a non-existent transaction", async function () {
      const unknownTxHash = ethers.keccak256(ethers.toUtf8Bytes("non-existent-tx"));
      const dummyProof = ethers.toUtf8Bytes("proof");

      await expect(
        verifier.connect(relayer).verifyCrossChainTx(unknownTxHash, dummyProof)
      ).to.be.revertedWith("Transaction not found");
    });

    it("Should revert if trying to verify an already verified transaction", async function () {
      const dummyProof = ethers.toUtf8Bytes("proof");

      // First verification succeeds
      await verifier.connect(relayer).verifyCrossChainTx(sampleTxHash, dummyProof);

      // Second verification attempt should revert
      await expect(
        verifier.connect(relayer).verifyCrossChainTx(sampleTxHash, dummyProof)
      ).to.be.revertedWith("Already verified");
    });
  });
});