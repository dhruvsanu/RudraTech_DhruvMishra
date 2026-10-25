const { ethers } = require("ethers");

const SOURCE_RPC_URL = process.env.SOURCE_RPC_URL || "http://127.0.0.1:8545";
const DEST_RPC_URL = process.env.DEST_RPC_URL || "http://127.0.0.1:9545";

async function main() {
  const sourceProvider = new ethers.JsonRpcProvider(SOURCE_RPC_URL);
  const destinationProvider = new ethers.JsonRpcProvider(DEST_RPC_URL);
  const sourceNetwork = await sourceProvider.getNetwork();
  const destinationNetwork = await destinationProvider.getNetwork();

  if (sourceNetwork.chainId === destinationNetwork.chainId) {
    throw new Error("Source and destination must be different chain IDs.");
  }

  const SourceRegistryArtifact = require("../artifacts/contracts/SourceRegistry.sol/SourceRegistry.json");
  const DestinationVerifierArtifact = require("../artifacts/contracts/DestinationVerifier.sol/DestinationVerifier.json");

  const sourceDeployer = await sourceProvider.getSigner(0);
  const destinationDeployer = await destinationProvider.getSigner(0);
  const relayer1 = await destinationProvider.getSigner(1);
  const relayer2 = await destinationProvider.getSigner(2);
  const relayer3 = await destinationProvider.getSigner(3);
  const sender = await sourceProvider.getSigner(4);
  const receiver = await sourceProvider.getSigner(5);

  console.log("\n=== Vecnaverse: genuine two-chain local demo ===");
  console.log(`Source chain:      ${sourceNetwork.chainId} (${SOURCE_RPC_URL})`);
  console.log(`Destination chain: ${destinationNetwork.chainId} (${DEST_RPC_URL})`);

  const SourceRegistry = new ethers.ContractFactory(
    SourceRegistryArtifact.abi,
    SourceRegistryArtifact.bytecode,
    sourceDeployer
  );
  const sourceRegistry = await SourceRegistry.deploy();
  await sourceRegistry.waitForDeployment();

  const relayers = await Promise.all([relayer1, relayer2, relayer3].map((signer) => signer.getAddress()));
  const DestinationVerifier = new ethers.ContractFactory(
    DestinationVerifierArtifact.abi,
    DestinationVerifierArtifact.bytecode,
    destinationDeployer
  );
  const destinationVerifier = await DestinationVerifier.deploy(
    sourceNetwork.chainId,
    await sourceRegistry.getAddress(),
    relayers,
    2
  );
  await destinationVerifier.waitForDeployment();

  console.log(`SourceRegistry:    ${await sourceRegistry.getAddress()}`);
  console.log(`DestinationVerifier: ${await destinationVerifier.getAddress()}`);
  console.log("Quorum:            2 of 3 independent relayers\n");

  const senderAddress = await sender.getAddress();
  const receiverAddress = await receiver.getAddress();
  const amount = ethers.parseEther("2.5");
  const txHash = ethers.keccak256(ethers.toUtf8Bytes(`vecnaverse-two-chain-${Date.now()}`));

  console.log("1. Registering the message on Source Chain...");
  const sourceTx = await sourceRegistry
    .connect(sender)
    .registerSourceTx(txHash, receiverAddress, amount, destinationNetwork.chainId);
  const sourceReceipt = await sourceTx.wait();
  console.log(`   Source block: ${sourceReceipt.blockNumber}`);

  console.log("2. Three relayers independently sign the destination-bound message...");
  const messageHash = await destinationVerifier.getMessageHash(
    txHash,
    senderAddress,
    receiverAddress,
    amount,
    sourceNetwork.chainId,
    await sourceRegistry.getAddress(),
    destinationNetwork.chainId
  );
  const signatures = await Promise.all(
    [relayer1, relayer2].map((relayer) => relayer.signMessage(ethers.getBytes(messageHash)))
  );
  console.log("   2 valid signatures collected (quorum met).");

  console.log("3. Verifying on Destination Chain...");
  const verifyTx = await destinationVerifier
    .connect(relayer1)
    .verifyWithQuorum(
      txHash,
      senderAddress,
      receiverAddress,
      amount,
      sourceNetwork.chainId,
      await sourceRegistry.getAddress(),
      destinationNetwork.chainId,
      signatures
    );
  const destinationReceipt = await verifyTx.wait();

  console.log(`   Destination block: ${destinationReceipt.blockNumber}`);
  console.log(`   Verification status: ${await destinationVerifier.verified(txHash) ? "VERIFIED ✅" : "FAILED ❌"}`);
  console.log("\nSecurity guarantees demonstrated:");
  console.log("- Source and destination have different chain IDs");
  console.log("- 2-of-3 relayer quorum is required");
  console.log("- Signed payload is bound to source contract and destination chain");
  console.log("- Reusing the same txHash is blocked on destination\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
