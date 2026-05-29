// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {AegisVault} from "../src/AegisVault.sol";
import {SwapExitAdapter} from "../src/adapters/SwapExitAdapter.sol";
import {AaveExitAdapter} from "../src/adapters/AaveExitAdapter.sol";

/// @notice Deploys the Solidity side of Aegis against a live network and wires it
///         to an already-deployed Stylus risk engine.
///
/// Required env vars:
///   PRIVATE_KEY            deployer key
///   RISK_ENGINE_ADDRESS    address of the activated Stylus RiskEngine
/// Optional env vars:
///   KEEPER_ADDRESS         agent session-key address granted KEEPER_ROLE
///   SWAP_ROUTER_ADDRESS    Uniswap-v3-style router (for SwapExitAdapter)
///   AAVE_POOL_ADDRESS      Aave V3 Pool (for AaveExitAdapter)
///   SEQUENCER_FEED_ADDRESS Chainlink L2 sequencer uptime feed
///
/// Usage:
///   forge script script/Deploy.s.sol \
///     --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast --verify
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address engine = vm.envAddress("RISK_ENGINE_ADDRESS");
        address deployer = vm.addr(pk);
        address keeper = vm.envOr("KEEPER_ADDRESS", deployer);

        vm.startBroadcast(pk);

        AegisVault vault = new AegisVault(deployer, engine);
        console2.log("AegisVault:", address(vault));

        // Grant the agent's session key the keeper role (bind the agent, not keys).
        if (keeper != deployer) {
            vault.grantRole(vault.KEEPER_ROLE(), keeper);
            console2.log("KEEPER_ROLE granted to:", keeper);
        }

        // Optional: SwapExitAdapter for Stock Tokens / generic ERC-20 exits.
        address router = vm.envOr("SWAP_ROUTER_ADDRESS", address(0));
        if (router != address(0)) {
            SwapExitAdapter swap = new SwapExitAdapter(router, deployer);
            vault.setAdapterAllowed(address(swap), true);
            console2.log("SwapExitAdapter:", address(swap));
        }

        // Optional: AaveExitAdapter for unwinding Aave V3 supply positions.
        address aavePool = vm.envOr("AAVE_POOL_ADDRESS", address(0));
        if (aavePool != address(0)) {
            AaveExitAdapter aave = new AaveExitAdapter(aavePool, deployer);
            vault.setAdapterAllowed(address(aave), true);
            console2.log("AaveExitAdapter:", address(aave));
        }

        // Optional: Chainlink sequencer uptime feed for the oracle check.
        address seqFeed = vm.envOr("SEQUENCER_FEED_ADDRESS", address(0));
        if (seqFeed != address(0)) {
            vault.setSequencerFeed(seqFeed);
            console2.log("Sequencer feed set:", seqFeed);
        }

        vm.stopBroadcast();
    }
}
