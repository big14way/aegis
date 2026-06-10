// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {AegisVault} from "../src/AegisVault.sol";
import {MockExitAdapter} from "../src/mocks/MockExitAdapter.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// @notice Deploys the Aegis executor stack on Robinhood Chain testnet (chain
///         46630), wired to the ALREADY-DEPLOYED, reproducibly-verified Stylus
///         RiskEngine (RISK_ENGINE_ADDRESS) and protecting a REAL Robinhood Chain
///         Stock Token (SOURCE_TOKEN, e.g. tTSLA). The exit target is a mock USDC
///         the adapter can mint, so the full arm -> verdict -> bounded-exit flow
///         runs end-to-end on Robinhood Chain with no external DEX. The deployer
///         is admin + keeper + protected user.
///
/// Required env: PRIVATE_KEY, RISK_ENGINE_ADDRESS, SOURCE_TOKEN
contract DeployRHC is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address engine = vm.envAddress("RISK_ENGINE_ADDRESS");
        address source = vm.envAddress("SOURCE_TOKEN"); // real RHC Stock Token (tTSLA)
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        MockExitAdapter adapter = new MockExitAdapter();
        MockERC20 target = new MockERC20("USD Coin", "USDC", 18); // exit target

        AegisVault vault = new AegisVault(deployer, engine);
        vault.setAdapterAllowed(address(adapter), true);
        // deployer already holds KEEPER_ROLE (granted in the vault constructor).

        vm.stopBroadcast();

        console2.log("RiskEngine (Stylus, RHC):", engine);
        console2.log("AegisVault:              ", address(vault));
        console2.log("MockExitAdapter:         ", address(adapter));
        console2.log("Source (REAL tTSLA):     ", source);
        console2.log("Target (USDC, mock):     ", address(target));

        string memory obj = "rhc";
        vm.serializeAddress(obj, "engine", engine);
        vm.serializeAddress(obj, "vault", address(vault));
        vm.serializeAddress(obj, "adapter", address(adapter));
        vm.serializeAddress(obj, "source", source);
        vm.serializeAddress(obj, "target", address(target));
        string memory json = vm.serializeAddress(obj, "protectedUser", deployer);
        vm.writeJson(json, "./deployments/rhc.json");
    }
}
