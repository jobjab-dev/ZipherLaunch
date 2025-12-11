// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title SimpleERC20
/// @notice A basic ERC20 token that can be created by anyone
contract SimpleERC20 is ERC20 {
    uint8 private _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply_,
        address owner_
    ) ERC20(name_, symbol_) {
        _decimals = decimals_;
        _mint(owner_, initialSupply_);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /// @notice Allows anyone to mint tokens (for testing purposes)
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
