// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A fee-on-transfer ERC-20: every transfer burns `feeBps` of the amount.
///         Used in tests to prove the vault/adapters forward the *actually
///         received* amount rather than trusting the requested amount.
contract MockFeeERC20 is ERC20 {
    uint256 public immutable feeBps; // fee burned on each transfer, in bps

    constructor(string memory n, string memory s, uint256 feeBps_) ERC20(n, s) {
        feeBps = feeBps_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev OZ v5 routes every balance change through `_update`. Skip mint/burn
    ///      (zero-address legs); on real transfers, burn the fee to 0xdead.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && feeBps > 0) {
            uint256 fee = (value * feeBps) / 10_000;
            if (fee > 0) {
                super._update(from, address(0xdEaD), fee);
                value -= fee;
            }
        }
        super._update(from, to, value);
    }
}
