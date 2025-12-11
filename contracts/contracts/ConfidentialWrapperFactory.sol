// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC7984ERC20Wrapper } from "@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol";
import { ERC7984 } from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ConfidentialTokenWrapper
/// @notice Wraps a public ERC20 token into a confidential ERC7984 token
contract ConfidentialTokenWrapper is ERC7984ERC20Wrapper, ZamaEthereumConfig {
    constructor(IERC20 underlyingToken_) 
        ERC7984ERC20Wrapper(underlyingToken_) 
        ERC7984(
            string.concat("Confidential ", IERC20Metadata(address(underlyingToken_)).name()),
            string.concat("c", IERC20Metadata(address(underlyingToken_)).symbol()),
            ""
        ) 
    {}
}

/// @title ConfidentialWrapperFactory
/// @notice Factory contract to create wrapper contracts for any ERC20 token
contract ConfidentialWrapperFactory {
    /// @notice Emitted when a new wrapper is created
    event WrapperCreated(
        address indexed wrapper,
        address indexed underlyingToken,
        address indexed creator
    );

    /// @notice Mapping from underlying token to wrapper
    mapping(address => address) public tokenToWrapper;

    /// @notice List of all wrappers
    address[] public wrappers;

    /// @notice Create a new confidential wrapper for an ERC20 token
    /// @param underlyingToken The ERC20 token to wrap
    /// @return wrapperAddress Address of the newly created wrapper
    function createWrapper(address underlyingToken) external returns (address wrapperAddress) {
        require(tokenToWrapper[underlyingToken] == address(0), "Wrapper already exists");

        ConfidentialTokenWrapper wrapper = new ConfidentialTokenWrapper(IERC20(underlyingToken));
        wrapperAddress = address(wrapper);

        tokenToWrapper[underlyingToken] = wrapperAddress;
        wrappers.push(wrapperAddress);

        emit WrapperCreated(wrapperAddress, underlyingToken, msg.sender);
    }

    /// @notice Get wrapper address for a token
    function getWrapper(address underlyingToken) external view returns (address) {
        return tokenToWrapper[underlyingToken];
    }

    /// @notice Get all wrappers
    function getAllWrappers() external view returns (address[] memory) {
        return wrappers;
    }

    /// @notice Get total number of wrappers
    function getWrapperCount() external view returns (uint256) {
        return wrappers.length;
    }
}
