// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Deployed only on the source chain. It records a transaction and
/// emits all fields that independent relayers must attest to on another chain.
contract SourceRegistry {
    struct Message {
        bytes32 txHash;
        address sender;
        address receiver;
        uint256 amount;
        uint256 sourceChainId;
        uint256 destinationChainId;
    }

    mapping(bytes32 => Message) public messages;

    event TransactionRegistered(
        bytes32 indexed txHash,
        address indexed sender,
        address indexed receiver,
        uint256 amount,
        uint256 sourceChainId,
        uint256 destinationChainId
    );

    function registerSourceTx(
        bytes32 txHash,
        address receiver,
        uint256 amount,
        uint256 destinationChainId
    ) external {
        require(messages[txHash].txHash == bytes32(0), "Tx already exists");
        require(receiver != address(0), "Invalid receiver");
        require(amount > 0, "Amount must be positive");
        require(destinationChainId != block.chainid, "Destination must differ");

        messages[txHash] = Message({
            txHash: txHash,
            sender: msg.sender,
            receiver: receiver,
            amount: amount,
            sourceChainId: block.chainid,
            destinationChainId: destinationChainId
        });

        emit TransactionRegistered(
            txHash,
            msg.sender,
            receiver,
            amount,
            block.chainid,
            destinationChainId
        );
    }
}
