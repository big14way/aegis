// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {ReferenceScorerSol} from "../src/mocks/ReferenceScorerSol.sol";

/// @notice Measures the gas of the Solidity baseline scorer for a representative
///         payload, and asserts it produces the SAME decisions as the Rust core
///         (`scoring.rs` unit tests). Run `forge test --match-contract GasBench
///         -vv` to print the gas number, then compare against the Stylus engine
///         measured via `cargo stylus` (see packages/risk-engine/README.md).
contract GasBenchTest is Test {
    ReferenceScorerSol internal scorer;

    function setUp() public {
        scorer = new ReferenceScorerSol();
    }

    function _payload(uint256 n)
        internal
        pure
        returns (uint8[] memory s, uint8[] memory c, uint256[] memory sev, uint256[] memory conf, uint256[] memory age)
    {
        s = new uint8[](n);
        c = new uint8[](n);
        sev = new uint256[](n);
        conf = new uint256[](n);
        age = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            s[i] = uint8(i % 7);
            c[i] = uint8((i % 7) + 1);
            sev[i] = 8_000;
            conf[i] = 8_500;
            age[i] = (i * 60) % 1_500;
        }
    }

    function test_Gas_Solidity_Baseline_8Signals() public view {
        (uint8[] memory s, uint8[] memory c, uint256[] memory sev, uint256[] memory conf, uint256[] memory age) =
            _payload(8);
        uint256 g0 = gasleft();
        scorer.score(s, c, sev, conf, age);
        uint256 used = g0 - gasleft();
        console2.log("ReferenceScorerSol.score gas (8 signals):", used);
    }

    function test_Gas_Solidity_Baseline_16Signals() public view {
        (uint8[] memory s, uint8[] memory c, uint256[] memory sev, uint256[] memory conf, uint256[] memory age) =
            _payload(16);
        uint256 g0 = gasleft();
        scorer.score(s, c, sev, conf, age);
        uint256 used = g0 - gasleft();
        console2.log("ReferenceScorerSol.score gas (16 signals):", used);
    }

    // --------- behavioural parity with the Rust core (scoring.rs) ---------

    function test_Parity_CorroboratedBridgeVerifierAutoFires() public view {
        uint8[] memory s = new uint8[](2);
        uint8[] memory c = new uint8[](2);
        uint256[] memory sev = new uint256[](2);
        uint256[] memory conf = new uint256[](2);
        uint256[] memory age = new uint256[](2);
        s[0] = 0;
        s[1] = 1;
        c[0] = 3; // BridgeVerifier
        c[1] = 3;
        sev[0] = 8_000;
        sev[1] = 8_000;
        conf[0] = 8_000;
        conf[1] = 8_000;
        (, uint8 tier, bool flag) = scorer.score(s, c, sev, conf, age);
        assertEq(tier, 3, "bridge-verifier corroborated -> auto-fire");
        assertTrue(flag);
    }

    function test_Parity_SingleWeakSocialIsAlertOnly() public view {
        uint8[] memory s = new uint8[](1);
        uint8[] memory c = new uint8[](1);
        uint256[] memory sev = new uint256[](1);
        uint256[] memory conf = new uint256[](1);
        uint256[] memory age = new uint256[](1);
        s[0] = 6; // social
        c[0] = 6; // spoof token
        sev[0] = 6_000;
        conf[0] = 5_000;
        age[0] = 0;
        (, uint8 tier, bool flag) = scorer.score(s, c, sev, conf, age);
        assertEq(tier, 1, "weak single social signal -> alert");
        assertFalse(flag);
    }

    function test_Parity_StaleSignalDoesNotFire() public view {
        uint8[] memory s = new uint8[](1);
        uint8[] memory c = new uint8[](1);
        uint256[] memory sev = new uint256[](1);
        uint256[] memory conf = new uint256[](1);
        uint256[] memory age = new uint256[](1);
        s[0] = 0;
        c[0] = 1;
        sev[0] = 10_000;
        conf[0] = 10_000;
        age[0] = 1_801; // older than the 1800s decay window
        (uint256 scoreBps, uint8 tier,) = scorer.score(s, c, sev, conf, age);
        assertEq(scoreBps, 0, "stale signal contributes nothing");
        assertEq(tier, 0);
    }
}
