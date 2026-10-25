// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CrossChainVerifier {
    struct Transaction {
        bytes32 txHash;
        address sender;
        address receiver;
        uint256 amount;
        uint256 originChainId;
        bool isVerified;
    }

    address public trustedRelayer;
    mapping(bytes32 => Transaction) public verifiedTransactions;

    event TransactionRegistered(bytes32 indexed txHash, uint256 originChainId);
    event TransactionVerifiedOnDest(bytes32 indexed txHash, bool success);

    modifier onlyRelayer() {
        require(msg.sender == trustedRelayer, "Only trusted relayer can call this");
        _;
    }

    constructor(address _trustedRelayer) {
        trustedRelayer = _trustedRelayer;
    }

    function registerSourceTx(
        bytes32 _txHash, 
        address _receiver, 
        uint256 _amount, 
        uint256 _originChainId
    ) external payable {
        require(verifiedTransactions[_txHash].txHash == bytes32(0), "Tx already exists");
        
        verifiedTransactions[_txHash] = Transaction({
            txHash: _txHash,
            sender: msg.sender,
            receiver: _receiver,
            amount: _amount,
            originChainId: _originChainId,
            isVerified: false
        });

        emit TransactionRegistered(_txHash, _originChainId);
    }

    function verifyCrossChainTx(
        bytes32 _txHash,
        bytes memory _cryptographicProof
    ) external onlyRelayer {
        Transaction storage txn = verifiedTransactions[_txHash];
        require(txn.txHash != bytes32(0), "Transaction not found");
        require(!txn.isVerified, "Already verified");

        if (_cryptographicProof.length > 0) {
            txn.isVerified = true;
            emit TransactionVerifiedOnDest(_txHash, true);
        } else {
            emit TransactionVerifiedOnDest(_txHash, false);
        }
    }
}
