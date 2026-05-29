// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal ERC-8004 (Trustless Agents) surface used to register the
///         Aegis guardian and attach reputation to its on-chain track record.
/// @dev    Canonical per-chain singletons:
///         Arbitrum One     Identity  0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
///                          Reputation 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
///         Arbitrum Sepolia Identity  0x8004A818BFB912233c491871b3d84c89A494BD9e
///                          Reputation 0x8004B663056A597Dffe9eCcC1965A193B7388713
interface IIdentityRegistry {
    /// @notice Mint an agent identity NFT pointing at an off-chain agent card URI.
    function register(string calldata agentURI) external returns (uint256 agentId);
    function setAgentURI(uint256 agentId, string calldata agentURI) external;
    function setAgentWallet(uint256 agentId, address wallet) external;
    function ownerOf(uint256 agentId) external view returns (address);
    function agentURI(uint256 agentId) external view returns (string memory);
}

interface IReputationRegistry {
    /// @notice Attach signed/structured feedback to an agent (e.g. exit outcome).
    function giveFeedback(uint256 agentId, uint8 score, bytes32 tag, string calldata uri) external;
    function getSummary(uint256 agentId) external view returns (uint64 count, uint256 scoreSum);
}
