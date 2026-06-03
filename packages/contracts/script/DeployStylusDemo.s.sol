// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {AegisVault} from "../src/AegisVault.sol";
import {MockExitAdapter} from "../src/mocks/MockExitAdapter.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockAggregatorV3} from "../src/mocks/MockAggregatorV3.sol";

/// @notice Deploys the Solidity demo stack (vault + adapter + mock tokens/feeds)
///         on a PUBLIC chain, wired to an ALREADY-DEPLOYED engine — typically the
///         real Arbitrum Stylus RiskEngine (RISK_ENGINE_ADDRESS). This makes the
///         full arm -> verdict -> bounded-exit flow run on the testnet against the
///         Stylus engine, with self-contained mock assets so no external DEX is
///         needed. Writes deployments/stylus.json for env generation.
///
/// Required env: PRIVATE_KEY, RISK_ENGINE_ADDRESS
/// Usage: RISK_ENGINE_ADDRESS=0x.. PRIVATE_KEY=0x.. \
///        forge script script/DeployStylusDemo.s.sol --rpc-url $STYLUS_RPC --broadcast
contract DeployStylusDemo is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address engine = vm.envAddress("RISK_ENGINE_ADDRESS");
        address deployer = vm.addr(pk);
        address keeper = vm.envOr("KEEPER_ADDRESS", deployer);
        address user = vm.envOr("PROTECTED_USER", deployer);

        vm.startBroadcast(pk);

        MockExitAdapter adapter = new MockExitAdapter();
        MockERC20 source = new MockERC20("Tokenized TSLA", "tTSLA", 18);
        MockERC20 target = new MockERC20("USD Coin", "USDC", 18);

        AegisVault vault = new AegisVault(deployer, engine);
        vault.setAdapterAllowed(address(adapter), true);
        if (keeper != deployer) {
            vault.grantRole(vault.KEEPER_ROLE(), keeper);
        }

        MockAggregatorV3 sequencer = new MockAggregatorV3(0, 0); // 0 == up
        sequencer.setStartedAt(1);
        vault.setSequencerFeed(address(sequencer));
        MockAggregatorV3 priceFeed = new MockAggregatorV3(1_900e8, 8);

        source.mint(user, 5_000e18);

        vm.stopBroadcast();

        console2.log("RiskEngine (Stylus):", engine);
        console2.log("AegisVault:         ", address(vault));
        console2.log("MockExitAdapter:    ", address(adapter));
        console2.log("Source (tTSLA):     ", address(source));
        console2.log("Target (USDC):      ", address(target));
        console2.log("SequencerFeed:      ", address(sequencer));
        console2.log("PriceFeed:          ", address(priceFeed));

        string memory obj = "stylus";
        vm.serializeAddress(obj, "engine", engine);
        vm.serializeAddress(obj, "vault", address(vault));
        vm.serializeAddress(obj, "adapter", address(adapter));
        vm.serializeAddress(obj, "source", address(source));
        vm.serializeAddress(obj, "target", address(target));
        vm.serializeAddress(obj, "sequencerFeed", address(sequencer));
        vm.serializeAddress(obj, "priceFeed", address(priceFeed));
        vm.serializeAddress(obj, "keeper", keeper);
        string memory json = vm.serializeAddress(obj, "protectedUser", user);
        vm.writeJson(json, "./deployments/stylus.json");
    }
}
