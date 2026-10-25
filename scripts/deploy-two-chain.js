const { ethers } = require("ethers");

const SOURCE_RPC_URL = process.env.SOURCE_RPC_URL || "http://127.0.0.1:8545";
const DEST_RPC_URL = process.env.DEST_RPC_URL || "http://127.0.0.1:9545";

async function main() {
  const sourceProvider = new ethers.JsonRpcProvider(SOURCE_RPC_URL);
  const destinationProvider = new ethers.JsonRpcProvider(DEST_RPC_URL);
  const sourceNetwork = await sourceProvider.getNetwork();
  const destinationNetwork = await destinationProvider.getNetwork();
  if (sourceNetwork.chainId === destinationNetwork.chainId) {
    throw new Error("Start two nodes with different chain IDs before deploying.");
  }

  const SourceRegistryArtifact = require("../artifacts/contracts/SourceRegistry.sol/SourceRegistry.json");
  const DestinationVerifierArtifact = require("../artifacts/contracts/DestinationVerifier.sol/DestinationVerifier.json");
  const SourceRegistry = new ethers.ContractFactory(
    SourceRegistryArtifact.abi,
    SourceRegistryArtifact.bytecode,
    await sourceProvider.getSigner(0)
  );
  const sourceRegistry = await SourceRegistry.deploy();
  await sourceRegistry.waitForDeployment();

  const relayers = await Promise.all(
    [1, 2, 3].map(async (index) => (await destinationProvider.getSigner(index)).getAddress())
  );
  const DestinationVerifier = new ethers.ContractFactory(
    DestinationVerifierArtifact.abi,
    DestinationVerifierArtifact.bytecode,
    await destinationProvider.getSigner(0)
  );
  const destinationVerifier = await DestinationVerifier.deploy(
    sourceNetwork.chainId,
    await sourceRegistry.getAddress(),
    relayers,
    2
  );
  await destinationVerifier.waitForDeployment();

  console.log("\nDeployment complete. Add these values to .env:");
  console.log(`SOURCE_CONTRACT_ADDRESS=${await sourceRegistry.getAddress()}`);
  console.log(`DESTINATION_CONTRACT_ADDRESS=${await destinationVerifier.getAddress()}`);
  console.log(`SOURCE_CHAIN_ID=${sourceNetwork.chainId}`);
  console.log(`DESTINATION_CHAIN_ID=${destinationNetwork.chainId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
