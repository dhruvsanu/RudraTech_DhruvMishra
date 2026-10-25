# Decentralized Cross-Chain Transaction Verifier

Vecnaverse National Level Hackathon 2026 · Team RudraTech

## What this prototype demonstrates

This is a local, two-chain EVM prototype for verifying a source-chain transaction on a separate destination chain. It does **not** use a single trusted relayer. A destination transaction requires a 2-of-3 independent-relayer quorum, and each signature is bound to the source chain, source contract, transaction details, and destination chain.

### Security features

- Two independent local Hardhat networks: Chain A (`31337`) and Chain B (`31338`)
- M-of-N relayer quorum (configured as 2-of-3)
- Source-contract and source-chain binding
- Destination-chain binding to stop cross-chain replay
- Unique signer enforcement
- On-chain replay protection for each transaction hash

## Run the tests

```bash
npx hardhat compile
npx hardhat test
```

## Run the genuine two-chain demo

Open three terminals in this project folder.

Terminal 1 — source chain:

```bash
npx hardhat node --config hardhat.chainA.config.js --hostname 127.0.0.1 --port 8545
```

Terminal 2 — destination chain:

```bash
npx hardhat node --config hardhat.chainB.config.js --hostname 127.0.0.1 --port 9545
```

Terminal 3 — deploy both contracts, register a transaction on Chain A, collect two relayer signatures, and verify on Chain B:

```bash
node scripts/demo-two-chain.js
```

The output reports different chain IDs and the final destination-chain verification result.

## Optional event-listening relayer

First deploy persistent contracts:

```bash
node scripts/deploy-two-chain.js
```

Copy `.env.example` to `.env`, then paste the two printed contract addresses and use **only local Hardhat development keys**. Start the listener with:

```bash
node scripts/relayer-two-chain.js
```

In another terminal, trigger a source transaction:

```bash
node scripts/register-source.js
```

Never place real wallet keys in `.env` or commit that file.

## Honest scope

The repository's static dashboard is an interactive visualisation. The executable proof is the local two-chain demo above. For a production deployment, the relayer-attested source state can be replaced with a light-client or ZK proof system for stronger trust minimisation.
