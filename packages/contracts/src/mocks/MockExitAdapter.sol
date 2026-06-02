// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IExitAdapter} from "../interfaces/IExitAdapter.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice The simplest possible exit adapter for deterministic local demos:
///         pulls the bounded `sourceAsset` and delivers `targetAsset` 1:1 to the
///         beneficiary. Lets the full arm -> signal -> verdict -> exit flow run
///         end-to-end on a local Nitro devnode with no external protocols.
contract MockExitAdapter is IExitAdapter {
    using SafeERC20 for IERC20;

    function exit(address sourceAsset, uint256 amount, address targetAsset, address beneficiary, uint256 minOut)
        external
        override
        returns (uint256 proceeds)
    {
        IERC20(sourceAsset).safeTransferFrom(msg.sender, address(this), amount);
        proceeds = amount; // deterministic 1:1 for local demos
        require(proceeds >= minOut, "Mock: insufficient output");
        MockERC20(targetAsset).mint(beneficiary, proceeds);
        return proceeds;
    }

    function name() external pure override returns (string memory) {
        return "MockExitAdapter";
    }
}
