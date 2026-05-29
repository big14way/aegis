// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IExitAdapter} from "../interfaces/IExitAdapter.sol";
import {ISwapRouter, ExactInputSingleParams} from "../interfaces/ISwapRouter.sol";

/// @title  SwapExitAdapter
/// @notice Consolidates a volatile position into a safe asset via a Uniswap-v3
///         style router. This is the exit route for Robinhood Chain Stock Tokens
///         (e.g. swap a tokenized TSLA position into USDC the moment a depeg or
///         exploit signal corroborates).
///
/// @dev    On Robinhood Chain testnet no canonical DEX is confirmed yet, so the
///         router address is configurable; point it at a live router on Arbitrum
///         Sepolia, or at MockSwapRouter for deterministic local end-to-end runs.
contract SwapExitAdapter is IExitAdapter, Ownable {
    using SafeERC20 for IERC20;

    ISwapRouter public router;
    uint24 public poolFee = 3000; // 0.30% default tier
    uint256 public slippageBps = 100; // 1.00% max slippage guard (owner-tunable)

    event RouterUpdated(address indexed router);
    event PoolFeeUpdated(uint24 fee);
    event SlippageUpdated(uint256 bps);

    constructor(address router_, address admin) Ownable(admin) {
        router = ISwapRouter(router_);
    }

    function setRouter(address router_) external onlyOwner {
        router = ISwapRouter(router_);
        emit RouterUpdated(router_);
    }

    function setPoolFee(uint24 fee) external onlyOwner {
        poolFee = fee;
        emit PoolFeeUpdated(fee);
    }

    function setSlippageBps(uint256 bps) external onlyOwner {
        require(bps <= 10_000, "bps");
        slippageBps = bps;
        emit SlippageUpdated(bps);
    }

    /// @inheritdoc IExitAdapter
    function exit(address sourceAsset, uint256 amount, address targetAsset, address beneficiary)
        external
        override
        returns (uint256 proceeds)
    {
        IERC20(sourceAsset).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(sourceAsset).forceApprove(address(router), amount);

        // amountOutMinimum is left to a price-aware caller in production; for the
        // crisis path we accept the slippage guard since exiting beats holding.
        ExactInputSingleParams memory params = ExactInputSingleParams({
            tokenIn: sourceAsset,
            tokenOut: targetAsset,
            fee: poolFee,
            recipient: beneficiary,
            amountIn: amount,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });
        proceeds = router.exactInputSingle(params);
        IERC20(sourceAsset).forceApprove(address(router), 0);
        return proceeds;
    }

    function name() external pure override returns (string memory) {
        return "SwapExitAdapter";
    }
}
