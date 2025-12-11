// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { FHE, euint64, ebool } from "@fhevm/solidity/lib/FHE.sol";

contract ConfidentialERC20 is ERC20 {
    mapping(address => euint64) internal _encBalances;
    mapping(address => mapping(address => euint64)) internal _allowances;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mintPublic(address to, uint64 amount) public {
        _mint(to, amount);
        euint64 encAmount = FHE.asEuint64(amount);
        _encBalances[to] = FHE.add(_encBalances[to], encAmount);
    }
    
    function shield(uint64 amount) public {
        transferFrom(msg.sender, address(this), amount);
        euint64 encAmount = FHE.asEuint64(amount);
        _encBalances[msg.sender] = FHE.add(_encBalances[msg.sender], encAmount);
    }

    function transferEncrypted(address to, euint64 encryptedAmount) public {
        euint64 userBalance = _encBalances[msg.sender];
        ebool canTransfer = FHE.ge(userBalance, encryptedAmount);
        
        euint64 newSenderBal = FHE.sub(userBalance, encryptedAmount);
        euint64 newToBal = FHE.add(_encBalances[to], encryptedAmount);
        
        _encBalances[msg.sender] = FHE.select(canTransfer, newSenderBal, userBalance);
        _encBalances[to] = FHE.select(canTransfer, newToBal, _encBalances[to]);
    }

    function approveEncrypted(address spender, euint64 amount) public {
        _allowances[msg.sender][spender] = amount;
    }

    function transferFromEncrypted(address from, address to, euint64 encryptedAmount) public {
        euint64 spenderAllowance = _allowances[from][msg.sender];
        euint64 fromBalance = _encBalances[from];

        ebool isAllowed = FHE.ge(spenderAllowance, encryptedAmount);
        ebool hasBalance = FHE.ge(fromBalance, encryptedAmount);
        ebool canTransfer = FHE.and(isAllowed, hasBalance);

        euint64 newAllowance = FHE.sub(spenderAllowance, encryptedAmount);
        _allowances[from][msg.sender] = FHE.select(canTransfer, newAllowance, spenderAllowance);
        
        euint64 newFromBal = FHE.sub(fromBalance, encryptedAmount);
        euint64 newToBal = FHE.add(_encBalances[to], encryptedAmount);
        
        _encBalances[from] = FHE.select(canTransfer, newFromBal, fromBalance);
        _encBalances[to] = FHE.select(canTransfer, newToBal, _encBalances[to]);
    }
    
    function balanceOfEncrypted(address user) public view returns (euint64) {
        return _encBalances[user];
    }
}
