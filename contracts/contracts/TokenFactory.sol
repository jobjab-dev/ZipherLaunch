// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./SimpleERC20.sol";

/// @title TokenFactory
/// @notice Factory contract to create new ERC20 tokens
contract TokenFactory {
    /// @notice Emitted when a new token is created
    event TokenCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        uint8 decimals,
        uint256 initialSupply
    );

    /// @notice List of all created tokens
    address[] public tokens;

    /// @notice Mapping from creator to their tokens
    mapping(address => address[]) public creatorTokens;

    /// @notice Create a new ERC20 token
    /// @param name Token name
    /// @param symbol Token symbol
    /// @param decimals Token decimals (usually 18)
    /// @param initialSupply Initial supply (in wei)
    /// @return tokenAddress Address of the newly created token
    function createToken(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 initialSupply
    ) external returns (address tokenAddress) {
        SimpleERC20 token = new SimpleERC20(
            name,
            symbol,
            decimals,
            initialSupply,
            msg.sender
        );
        
        tokenAddress = address(token);
        tokens.push(tokenAddress);
        creatorTokens[msg.sender].push(tokenAddress);

        emit TokenCreated(tokenAddress, msg.sender, name, symbol, decimals, initialSupply);
    }

    /// @notice Get total number of tokens created
    function getTokenCount() external view returns (uint256) {
        return tokens.length;
    }

    /// @notice Get all tokens created by a specific address
    function getTokensByCreator(address creator) external view returns (address[] memory) {
        return creatorTokens[creator];
    }

    /// @notice Get all tokens
    function getAllTokens() external view returns (address[] memory) {
        return tokens;
    }
}
