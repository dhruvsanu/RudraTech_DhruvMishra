const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Two-chain verification security", function () {
  let sourceRegistry;
  let destinationVerifier;
  let sender;
  let receiver;
  let relayer1;
  let relayer2;
  let relayer3;
  let outsider;

  const EXPECTED_SOURCE_CHAIN_ID = 11155111n;
  const TX_HASH = ethers.keccak256(ethers.toUtf8Bytes("two-chain-unit-test"));
  const AMOUNT = ethers.parseEther("1");

  beforeEach(async function () {
    [, relayer1, relayer2, relayer3, sender, receiver, outsider] = await ethers.getSigners();
    const SourceRegistry = await ethers.getContractFactory("SourceRegistry");
    sourceRegistry = await SourceRegistry.deploy();
    await sourceRegistry.waitForDeployment();

    const DestinationVerifier = await ethers.getContractFactory("DestinationVerifier");
    destinationVerifier = await DestinationVerifier.deploy(
      EXPECTED_SOURCE_CHAIN_ID,
      await sourceRegistry.getAddress(),
      [relayer1.address, relayer2.address, relayer3.address],
      2
    );
    await destinationVerifier.waitForDeployment();
  });

  async function signedPayload({ signatures = 2, destinationChainId } = {}) {
    const network = await ethers.provider.getNetwork();
    const destination = destinationChainId ?? network.chainId;
    const messageHash = await destinationVerifier.getMessageHash(
      TX_HASH,
      sender.address,
      receiver.address,
      AMOUNT,
      EXPECTED_SOURCE_CHAIN_ID,
      await sourceRegistry.getAddress(),
      destination
    );
    const allRelayers = [relayer1, relayer2, relayer3];
    return {
      destination,
      signatures: await Promise.all(
        allRelayers.slice(0, signatures).map((relayer) => relayer.signMessage(ethers.getBytes(messageHash)))
      ),
    };
  }

  it("records a source message bound to a different destination chain", async function () {
    await expect(sourceRegistry.connect(sender).registerSourceTx(TX_HASH, receiver.address, AMOUNT, 31338))
      .to.emit(sourceRegistry, "TransactionRegistered");

    const stored = await sourceRegistry.messages(TX_HASH);
    expect(stored.sender).to.equal(sender.address);
    expect(stored.destinationChainId).to.equal(31338n);

    await expect(sourceRegistry.connect(sender).registerSourceTx(TX_HASH, receiver.address, AMOUNT, 31338))
      .to.be.revertedWith("Tx already exists");
  });

  it("accepts two unique authorised relayer signatures", async function () {
    const { destination, signatures } = await signedPayload();

    await expect(
      destinationVerifier.verifyWithQuorum(
        TX_HASH,
        sender.address,
        receiver.address,
        AMOUNT,
        EXPECTED_SOURCE_CHAIN_ID,
        await sourceRegistry.getAddress(),
        destination,
        signatures
      )
    ).to.emit(destinationVerifier, "TransactionVerifiedOnDestination");

    expect(await destinationVerifier.verified(TX_HASH)).to.equal(true);
  });

  it("rejects a single signature when the quorum is two", async function () {
    const { destination, signatures } = await signedPayload({ signatures: 1 });
    await expect(
      destinationVerifier.verifyWithQuorum(
        TX_HASH, sender.address, receiver.address, AMOUNT, EXPECTED_SOURCE_CHAIN_ID,
        await sourceRegistry.getAddress(), destination, signatures
      )
    ).to.be.revertedWith("Not enough signatures");
  });

  it("rejects a payload replayed to the wrong destination chain", async function () {
    const { signatures } = await signedPayload({ destinationChainId: 999n });
    await expect(
      destinationVerifier.verifyWithQuorum(
        TX_HASH, sender.address, receiver.address, AMOUNT, EXPECTED_SOURCE_CHAIN_ID,
        await sourceRegistry.getAddress(), 999, signatures
      )
    ).to.be.revertedWith("Wrong destination chain");
  });

  it("rejects an unauthorised signer and a replay", async function () {
    const network = await ethers.provider.getNetwork();
    const messageHash = await destinationVerifier.getMessageHash(
      TX_HASH, sender.address, receiver.address, AMOUNT, EXPECTED_SOURCE_CHAIN_ID,
      await sourceRegistry.getAddress(), network.chainId
    );
    const forged = await outsider.signMessage(ethers.getBytes(messageHash));
    const valid = await relayer1.signMessage(ethers.getBytes(messageHash));

    await expect(
      destinationVerifier.verifyWithQuorum(
        TX_HASH, sender.address, receiver.address, AMOUNT, EXPECTED_SOURCE_CHAIN_ID,
        await sourceRegistry.getAddress(), network.chainId, [valid, forged]
      )
    ).to.be.revertedWith("Unauthorised relayer");

    const { destination, signatures } = await signedPayload();
    await destinationVerifier.verifyWithQuorum(
      TX_HASH, sender.address, receiver.address, AMOUNT, EXPECTED_SOURCE_CHAIN_ID,
      await sourceRegistry.getAddress(), destination, signatures
    );
    await expect(
      destinationVerifier.verifyWithQuorum(
        TX_HASH, sender.address, receiver.address, AMOUNT, EXPECTED_SOURCE_CHAIN_ID,
        await sourceRegistry.getAddress(), destination, signatures
      )
    ).to.be.revertedWith("Replay blocked");
  });
});
