// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
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
contract SwapExitAdapter is IExitAdapter, Ownable2Step {
    using SafeERC20 for IERC20;

    ISwapRouter public router;
    uint24 public poolFee = 3000; // 0.30% default tier

    event RouterUpdated(address indexed router);
    event PoolFeeUpdated(uint24 fee);

    error InsufficientOutput(uint256 proceeds, uint256 minOut);

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

    /// @inheritdoc IExitAdapter
    function exit(address sourceAsset, uint256 amount, address targetAsset, address beneficiary, uint256 minOut)
        external
        override
        returns (uint256 proceeds)
    {
        // Measure what actually arrives so a fee-on-transfer source can't desync
        // the amount swapped against the approval.
        uint256 balBefore = IERC20(sourceAsset).balanceOf(address(this));
        IERC20(sourceAsset).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(sourceAsset).balanceOf(address(this)) - balBefore;
        IERC20(sourceAsset).forceApprove(address(router), received);

        // Enforce the caller-supplied slippage floor on-chain via the router AND
        // re-check the returned proceeds (defense in depth). A crisis exit still
        // beats holding, but giving 100% of slippage to MEV is not acceptable —
        // the keeper passes a price-aware `minOut` (0 only for trusted/mock routes).
        ExactInputSingleParams memory params = ExactInputSingleParams({
            tokenIn: sourceAsset,
            tokenOut: targetAsset,
            fee: poolFee,
            recipient: beneficiary,
            amountIn: received,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0
        });
        proceeds = router.exactInputSingle(params);
        IERC20(sourceAsset).forceApprove(address(router), 0);
        if (proceeds < minOut) revert InsufficientOutput(proceeds, minOut);
        return proceeds;
    }

    function name() external pure override returns (string memory) {
        return "SwapExitAdapter";
    }
}
