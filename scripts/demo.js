const { ethers } = require("hardhat");

async function main() {
  console.log("=========================================================");
  console.log("🚀 VECNAVERSE 2026: CROSS-CHAIN VERIFIER LIVE SIMULATION");
  console.log("=========================================================\n");

  const [owner, relayer, sender, receiver] = await ethers.getSigners();
  console.log("👤 Sender Address   :", sender.address);
  console.log("🎯 Receiver Address :", receiver.address);
  console.log("🛡️  Trusted Relayer  :", relayer.address);

  // 1. Deploy Contract
  console.log("\n[STEP 1] Deploying CrossChainVerifier Smart Contract...");
  const Verifier = await ethers.getContractFactory("CrossChainVerifier");
  const verifier = await Verifier.deploy(relayer.address);
  await verifier.waitForDeployment();
  const contractAddr = await verifier.getAddress();
  console.log("✅ Contract Deployed at:", contractAddr);

  // 2. Register Transaction on Source Chain (e.g., Sepolia Chain ID: 11155111)
  const originChainId = 11155111;
  const amount = ethers.parseEther("2.5");
  const txHash = ethers.keccak256(ethers.toUtf8Bytes("vecnaverse-live-tx-001"));

  console.log("\n[STEP 2] User initiating transaction on Source Chain (Chain ID: 11155111)...");
  const regTx = await verifier.connect(sender).registerSourceTx(txHash, receiver.address, amount, originChainId);
  await regTx.wait();
  console.log("✅ Source Tx Registered! TxHash:", txHash);

  // 3. Relayer detects event & builds cryptographic signature proof
  console.log("\n[STEP 3] Relayer detected 'TransactionRegistered' event!");
  console.log("🔐 Generating ECDSA Cryptographic Proof from Source Tx data...");
  const messageHash = ethers.solidityPackedKeccak256(
    ["bytes32", "address", "address", "uint256", "uint256"],
    [txHash, sender.address, receiver.address, amount, originChainId]
  );
  const cryptographicProof = await relayer.signMessage(ethers.getBytes(messageHash));
  console.log("✅ Cryptographic Proof Generated:", cryptographicProof.slice(0, 42) + "...");

  // 4. Relayer triggers verification on Destination Chain
  console.log("\n[STEP 4] Relayer submitting proof to Destination Chain...");
  const verifyTx = await verifier.connect(relayer).verifyCrossChainTx(txHash, cryptographicProof);
  const receipt = await verifyTx.wait();
  console.log("✅ Verified in Block #", receipt.blockNumber, "| Gas Used:", receipt.gasUsed.toString());

  // 5. Final On-Chain Status Check
  const finalState = await verifier.verifiedTransactions(txHash);
  console.log("\n=========================================================");
  console.log("🎉 FINAL ON-CHAIN VERIFICATION STATUS:", finalState.isVerified ? "VERIFIED (TRUE) ✅" : "FAILED ❌");
  console.log("=========================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
