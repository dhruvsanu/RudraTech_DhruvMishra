require("dotenv").config();
const { ethers } = require("ethers");

const SOURCE_RPC_URL = process.env.SOURCE_RPC_URL || "http://127.0.0.1:8545";
const DEST_RPC_URL = process.env.DEST_RPC_URL || "http://127.0.0.1:9545";
const SOURCE_CONTRACT_ADDRESS = process.env.SOURCE_CONTRACT_ADDRESS;
const SOURCE_SENDER_PRIVATE_KEY = process.env.SOURCE_SENDER_PRIVATE_KEY;
const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS;
const AMOUNT = process.env.AMOUNT || "1.0";

const SOURCE_ABI = [
  "function registerSourceTx(bytes32,address,uint256,uint256) external",
];

async function main() {
  if (!SOURCE_CONTRACT_ADDRESS || !SOURCE_SENDER_PRIVATE_KEY || !RECEIVER_ADDRESS) {
    throw new Error("Set SOURCE_CONTRACT_ADDRESS, SOURCE_SENDER_PRIVATE_KEY and RECEIVER_ADDRESS in .env");
  }

  const sourceProvider = new ethers.JsonRpcProvider(SOURCE_RPC_URL);
  const destinationProvider = new ethers.JsonRpcProvider(DEST_RPC_URL);
  const destinationNetwork = await destinationProvider.getNetwork();
  const sender = new ethers.Wallet(SOURCE_SENDER_PRIVATE_KEY, sourceProvider);
  const sourceContract = new ethers.Contract(SOURCE_CONTRACT_ADDRESS, SOURCE_ABI, sender);
  const txHash = ethers.keccak256(ethers.toUtf8Bytes(`vecnaverse-message-${Date.now()}`));
  const tx = await sourceContract.registerSourceTx(
    txHash,
    RECEIVER_ADDRESS,
    ethers.parseEther(AMOUNT),
    destinationNetwork.chainId
  );
  const receipt = await tx.wait();
  console.log(`Registered ${txHash} on source block ${receipt.blockNumber}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
