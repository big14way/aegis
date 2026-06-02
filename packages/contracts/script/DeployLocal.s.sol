// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {AegisVault} from "../src/AegisVault.sol";
import {LocalRiskEngine} from "../src/dev/LocalRiskEngine.sol";
import {MockExitAdapter} from "../src/mocks/MockExitAdapter.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockAggregatorV3} from "../src/mocks/MockAggregatorV3.sol";

/// @notice Deploys a complete, genuinely on-chain Aegis stack against a plain EVM
///         (local anvil / Nitro devnode) using `LocalRiskEngine` — the full
///         Solidity engine that runs the real scoring algorithm and exposes the
///         identical `IRiskEngine` ABI as the production Stylus engine. The vault,
///         agent, and dashboard wire against this unchanged; switching to Stylus
///         later is a one-line engine-address swap (see DeployStylus runbook).
///
/// Usage: forge script script/DeployLocal.s.sol --rpc-url http://localhost:8545 --broadcast
contract DeployLocal is Script {
    function run() external {
        uint256 pk =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(pk);
        address keeper = vm.envOr("KEEPER_ADDRESS", deployer);
        address user = vm.envOr("PROTECTED_USER", deployer);

        vm.startBroadcast(pk);

        LocalRiskEngine engine = new LocalRiskEngine();
        MockExitAdapter adapter = new MockExitAdapter();
        MockERC20 source = new MockERC20("Tokenized TSLA", "tTSLA", 18);
        MockERC20 target = new MockERC20("USD Coin", "USDC", 18);

        AegisVault vault = new AegisVault(deployer, address(engine));
        vault.setAdapterAllowed(address(adapter), true);
        if (keeper != deployer) {
            vault.grantRole(vault.KEEPER_ROLE(), keeper);
        }

        // Chainlink sequencer-uptime + price feed for the checkOracle demo.
        MockAggregatorV3 sequencer = new MockAggregatorV3(0, 0); // 0 == sequencer up
        sequencer.setStartedAt(1);
        vault.setSequencerFeed(address(sequencer));
        MockAggregatorV3 priceFeed = new MockAggregatorV3(1_900e8, 8); // 5% off a $2000 peg

        // Seed the demo user with a protected position.
        source.mint(user, 5_000e18);

        vm.stopBroadcast();

        console2.log("LocalRiskEngine:", address(engine));
        console2.log("AegisVault:     ", address(vault));
        console2.log("MockExitAdapter:", address(adapter));
        console2.log("Source (tTSLA): ", address(source));
        console2.log("Target (USDC):  ", address(target));
        console2.log("SequencerFeed:  ", address(sequencer));
        console2.log("PriceFeed:      ", address(priceFeed));
        console2.log("Keeper:         ", keeper);
        console2.log("ProtectedUser:  ", user);

        // Persist a machine-readable deployment for env generation.
        string memory obj = "deploy";
        vm.serializeAddress(obj, "engine", address(engine));
        vm.serializeAddress(obj, "vault", address(vault));
        vm.serializeAddress(obj, "adapter", address(adapter));
        vm.serializeAddress(obj, "source", address(source));
        vm.serializeAddress(obj, "target", address(target));
        vm.serializeAddress(obj, "sequencerFeed", address(sequencer));
        vm.serializeAddress(obj, "priceFeed", address(priceFeed));
        vm.serializeAddress(obj, "keeper", keeper);
        string memory json = vm.serializeAddress(obj, "protectedUser", user);
        vm.writeJson(json, "./deployments/local.json");
    }
}
