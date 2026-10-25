// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Deployed only on the destination chain. A message is accepted only
/// when the expected source chain/contract and this chain are bound into the
/// signed payload and the required number of independent relayers sign it.
contract DestinationVerifier {
    uint256 public immutable expectedSourceChainId;
    address public immutable expectedSourceContract;
    uint256 public immutable requiredQuorum;

    mapping(address => bool) public isRelayer;
    mapping(bytes32 => bool) public verified;

    event TransactionVerifiedOnDestination(
        bytes32 indexed txHash,
        uint256 indexed sourceChainId,
        uint256 indexed destinationChainId,
        uint256 signerCount
    );

    constructor(
        uint256 sourceChainId,
        address sourceContract,
        address[] memory relayers,
        uint256 quorum
    ) {
        require(sourceContract != address(0), "Invalid source contract");
        require(relayers.length > 0, "No relayers");
        require(quorum > 0 && quorum <= relayers.length, "Invalid quorum");

        expectedSourceChainId = sourceChainId;
        expectedSourceContract = sourceContract;
        requiredQuorum = quorum;

        for (uint256 i = 0; i < relayers.length; i++) {
            require(relayers[i] != address(0), "Invalid relayer");
            require(!isRelayer[relayers[i]], "Duplicate relayer");
            isRelayer[relayers[i]] = true;
        }
    }

    function getMessageHash(
        bytes32 txHash,
        address sender,
        address receiver,
        uint256 amount,
        uint256 sourceChainId,
        address sourceContract,
        uint256 destinationChainId
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                address(this),
                block.chainid,
                txHash,
                sender,
                receiver,
                amount,
                sourceChainId,
                sourceContract,
                destinationChainId
            )
        );
    }

    function verifyWithQuorum(
        bytes32 txHash,
        address sender,
        address receiver,
        uint256 amount,
        uint256 sourceChainId,
        address sourceContract,
        uint256 destinationChainId,
        bytes[] calldata signatures
    ) external {
        require(!verified[txHash], "Replay blocked");
        require(sourceChainId == expectedSourceChainId, "Wrong source chain");
        require(sourceContract == expectedSourceContract, "Wrong source contract");
        require(destinationChainId == block.chainid, "Wrong destination chain");
        require(signatures.length >= requiredQuorum, "Not enough signatures");

        bytes32 messageHash = getMessageHash(
            txHash,
            sender,
            receiver,
            amount,
            sourceChainId,
            sourceContract,
            destinationChainId
        );

        address[] memory seenSigners = new address[](signatures.length);
        uint256 validSignatures;

        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = _recover(messageHash, signatures[i]);
            require(isRelayer[signer], "Unauthorised relayer");

            for (uint256 j = 0; j < validSignatures; j++) {
                require(seenSigners[j] != signer, "Duplicate signature");
            }

            seenSigners[validSignatures] = signer;
            validSignatures++;
        }

        require(validSignatures >= requiredQuorum, "Quorum not met");
        verified[txHash] = true;

        emit TransactionVerifiedOnDestination(
            txHash,
            sourceChainId,
            destinationChainId,
            validSignatures
        );
    }

    function _recover(bytes32 messageHash, bytes calldata signature) private pure returns (address) {
        require(signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (v < 27) v += 27;
        require(v == 27 || v == 28, "Invalid signature v");

        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        address signer = ecrecover(ethSignedMessageHash, v, r, s);
        require(signer != address(0), "Invalid signature");
        return signer;
    }
}
