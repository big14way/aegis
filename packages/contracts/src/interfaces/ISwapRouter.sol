// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal swap-router surface (Uniswap-v3-style exactInputSingle) used
///         by SwapExitAdapter to consolidate a position into a safe asset.
struct ExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    uint24 fee;
    address recipient;
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint160 sqrtPriceLimitX96;
}

interface ISwapRouter {
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}
