require("dotenv").config();
const { ethers } = require("ethers");


const SOURCE_RPC_URL = process.env.SOURCE_RPC_URL || "http://127.0.0.1:8545";
const DEST_RPC_URL = process.env.DEST_RPC_URL || "http://127.0.0.1:8545";


const RELAYER_PRIVATE_KEY =
  process.env.RELAYER_PRIVATE_KEY ||
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const CONTRACT_ADDRESS =
  process.env.CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";


const CONTRACT_ABI = [
  "event TransactionRegistered(bytes32 indexed txHash, uint256 originChainId)",
  "event TransactionVerifiedOnDest(bytes32 indexed txHash, bool success)",
  "function verifyCrossChainTx(bytes32 _txHash, bytes memory _cryptographicProof) external",
  "function verifiedTransactions(bytes32) external view returns (bytes32 txHash, address sender, address receiver, uint256 amount, uint256 originChainId, bool isVerified)"
];


async function generateCryptographicProof(txData, relayerWallet) {
  
  const messageHash = ethers.solidityPackedKeccak256(
    ["bytes32", "address", "address", "uint256", "uint256"],
    [
      txData.txHash,
      txData.sender,
      txData.receiver,
      txData.amount,
      txData.originChainId
    ]
  );

  
  const signature = await relayerWallet.signMessage(ethers.getBytes(messageHash));
  return signature;
}

async function startRelayer() {
  console.log("====================================================");
  console.log("Starting Decentralized Cross-Chain Relayer Service...");
  console.log("====================================================");

  const sourceProvider = new ethers.JsonRpcProvider(SOURCE_RPC_URL);
  const destProvider = new ethers.JsonRpcProvider(DEST_RPC_URL);

  const relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, destProvider);
  console.log(`Relayer Address     : ${relayerWallet.address}`);
  console.log(`Target Contract     : ${CONTRACT_ADDRESS}`);

  
  const sourceContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, sourceProvider);
  const destContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, relayerWallet);

  console.log("\nListening for 'TransactionRegistered' events...\n");

  
  sourceContract.on("TransactionRegistered", async (txHash, originChainId, event) => {
    console.log("----------------------------------------------------");
    console.log(`[NEW EVENT] TransactionRegistered detected!`);
    console.log(`  -> TxHash        : ${txHash}`);
    console.log(`  -> OriginChainId : ${originChainId.toString()}`);

    try {
      
      const txData = await destContract.verifiedTransactions(txHash);

      if (txData.isVerified) {
        console.log(`  [SKIP] Transaction ${txHash} is already verified.`);
        return;
      }

      
      console.log(`  -> Generating cryptographic attestation proof...`);
      const cryptographicProof = await generateCryptographicProof(txData, relayerWallet);
      console.log(`  -> Proof Generated (${cryptographicProof.slice(0, 26)}...)`);

      
      console.log(`  -> Submitting verification transaction to Destination Chain...`);
      const txResponse = await destContract.verifyCrossChainTx(txHash, cryptographicProof);
      console.log(`  -> Relayer Tx Sent : ${txResponse.hash}`);

      const receipt = await txResponse.wait();
      console.log(
        `  [SUCCESS] Verified in Block #${receipt.blockNumber} (Gas Used: ${receipt.gasUsed.toString()})`
      );
      console.log("----------------------------------------------------\n");
    } catch (error) {
      console.error(`  [ERROR] Verification failed for ${txHash}:`, error.reason || error.message);
      console.log("----------------------------------------------------\n");
    }
  });

  
  destContract.on("TransactionVerifiedOnDest", (txHash, success) => {
    console.log(`[DEST CONFIRMATION] TxHash: ${txHash} | Verified Status: ${success}`);
  });
}

startRelayer().catch((err) => {
  console.error("Relayer fatal error:", err);
  process.exit(1);
});