require("dotenv").config();
const { ethers } = require("ethers");

const SOURCE_RPC_URL = process.env.SOURCE_RPC_URL || "http://127.0.0.1:8545";
const DEST_RPC_URL = process.env.DEST_RPC_URL || "http://127.0.0.1:9545";
const SOURCE_CONTRACT_ADDRESS = process.env.SOURCE_CONTRACT_ADDRESS;
const DESTINATION_CONTRACT_ADDRESS = process.env.DESTINATION_CONTRACT_ADDRESS;

const RELAYER_PRIVATE_KEYS = [
  process.env.RELAYER_PRIVATE_KEY_1,
  process.env.RELAYER_PRIVATE_KEY_2,
  process.env.RELAYER_PRIVATE_KEY_3,
].filter(Boolean);

const SOURCE_ABI = [
  "event TransactionRegistered(bytes32 indexed txHash,address indexed sender,address indexed receiver,uint256 amount,uint256 sourceChainId,uint256 destinationChainId)",
];

const DESTINATION_ABI = [
  "function getMessageHash(bytes32,address,address,uint256,uint256,address,uint256) view returns (bytes32)",
  "function verifyWithQuorum(bytes32,address,address,uint256,uint256,address,uint256,bytes[]) external",
  "function requiredQuorum() view returns (uint256)",
];

async function main() {
  if (!SOURCE_CONTRACT_ADDRESS || !DESTINATION_CONTRACT_ADDRESS) {
    throw new Error("Set SOURCE_CONTRACT_ADDRESS and DESTINATION_CONTRACT_ADDRESS in .env");
  }
  if (RELAYER_PRIVATE_KEYS.length < 2) {
    throw new Error("Set at least two local development relayer keys in .env");
  }

  const sourceProvider = new ethers.JsonRpcProvider(SOURCE_RPC_URL);
  const destinationProvider = new ethers.JsonRpcProvider(DEST_RPC_URL);
  const destinationNetwork = await destinationProvider.getNetwork();
  const sourceContract = new ethers.Contract(SOURCE_CONTRACT_ADDRESS, SOURCE_ABI, sourceProvider);
  const relayers = RELAYER_PRIVATE_KEYS.map((key) => new ethers.Wallet(key, destinationProvider));
  const destinationContract = new ethers.Contract(
    DESTINATION_CONTRACT_ADDRESS,
    DESTINATION_ABI,
    relayers[0]
  );
  const quorum = Number(await destinationContract.requiredQuorum());

  console.log(`Listening on source contract: ${SOURCE_CONTRACT_ADDRESS}`);
  console.log(`Submitting to destination:    ${DESTINATION_CONTRACT_ADDRESS}`);
  console.log(`Destination chain:            ${destinationNetwork.chainId}`);
  console.log(`Configured quorum:             ${quorum}-of-${relayers.length}\n`);

  sourceContract.on(
    "TransactionRegistered",
    async (txHash, sender, receiver, amount, sourceChainId, destinationChainId) => {
      try {
        if (destinationChainId !== destinationNetwork.chainId) {
          console.log(`Ignoring ${txHash}: event targets chain ${destinationChainId}`);
          return;
        }

        const messageHash = await destinationContract.getMessageHash(
          txHash,
          sender,
          receiver,
          amount,
          sourceChainId,
          SOURCE_CONTRACT_ADDRESS,
          destinationChainId
        );
        const signatures = await Promise.all(
          relayers.slice(0, quorum).map((relayer) => relayer.signMessage(ethers.getBytes(messageHash)))
        );
        const tx = await destinationContract.verifyWithQuorum(
          txHash,
          sender,
          receiver,
          amount,
          sourceChainId,
          SOURCE_CONTRACT_ADDRESS,
          destinationChainId,
          signatures
        );
        const receipt = await tx.wait();
        console.log(`Verified ${txHash} on destination block ${receipt.blockNumber}`);
      } catch (error) {
        console.error(`Could not relay ${txHash}:`, error.shortMessage || error.message);
      }
    }
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
