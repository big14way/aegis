// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {AegisVault} from "../src/AegisVault.sol";
import {MockRiskEngine} from "../src/mocks/MockRiskEngine.sol";
import {MockExitAdapter} from "../src/mocks/MockExitAdapter.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockAggregatorV3} from "../src/mocks/MockAggregatorV3.sol";

/// @notice Deploys a complete, self-contained mock stack so the full
///         arm -> signal -> verdict -> exit flow runs end-to-end on a local
///         Nitro devnode or Anvil without any external protocols. Mirrors what
///         the agent + dashboard expect, using MockRiskEngine in place of the
///         Stylus engine (the real engine is exercised by the Rust tests).
///
/// Usage (Anvil): forge script script/DeployMocks.s.sol --rpc-url http://localhost:8545 --broadcast
contract DeployMocks is Script {
    function run() external {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        MockRiskEngine engine = new MockRiskEngine();
        engine.setDecision(8_200, 3, true); // pre-arm a fired decision for the demo

        MockExitAdapter adapter = new MockExitAdapter();
        MockERC20 source = new MockERC20("Tokenized TSLA", "tTSLA", 18);
        MockERC20 target = new MockERC20("USD Coin", "USDC", 18);
        MockAggregatorV3 feed = new MockAggregatorV3(1_900e8, 8); // 5% off a $2000 peg

        AegisVault vault = new AegisVault(deployer, address(engine));
        vault.setAdapterAllowed(address(adapter), true);

        // Seed the deployer as a demo user.
        source.mint(deployer, 5_000e18);

        console2.log("RiskEngine (mock):", address(engine));
        console2.log("AegisVault:       ", address(vault));
        console2.log("ExitAdapter:      ", address(adapter));
        console2.log("Source (tTSLA):   ", address(source));
        console2.log("Target (USDC):    ", address(target));
        console2.log("Price feed:       ", address(feed));

        vm.stopBroadcast();
    }
}
