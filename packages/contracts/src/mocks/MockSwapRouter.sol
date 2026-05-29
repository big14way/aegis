// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISwapRouter, ExactInputSingleParams} from "../interfaces/ISwapRouter.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice Deterministic 1:1 swap router for local end-to-end runs. Pulls
///         `tokenIn` and mints/sends `tokenOut` to the recipient at parity.
contract MockSwapRouter is ISwapRouter {
    using SafeERC20 for IERC20;

    function exactInputSingle(ExactInputSingleParams calldata p)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        IERC20(p.tokenIn).safeTransferFrom(msg.sender, address(this), p.amountIn);
        amountOut = p.amountIn; // 1:1 for the demo
        MockERC20(p.tokenOut).mint(p.recipient, amountOut);
        return amountOut;
    }
}
