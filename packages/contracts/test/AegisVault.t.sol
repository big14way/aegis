// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {AegisVault} from "../src/AegisVault.sol";
import {MockRiskEngine} from "../src/mocks/MockRiskEngine.sol";
import {MockExitAdapter} from "../src/mocks/MockExitAdapter.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockAggregatorV3} from "../src/mocks/MockAggregatorV3.sol";

contract AegisVaultTest is Test {
    AegisVault internal vault;
    MockRiskEngine internal engine;
    MockExitAdapter internal adapter;
    MockERC20 internal source; // e.g. tokenized TSLA / aToken
    MockERC20 internal target; // e.g. USDC

    address internal admin = address(this);
    address internal keeper = makeAddr("keeper");
    address internal user = makeAddr("user");

    uint256 internal constant CAP = 1_000e18;
    uint64 internal constant WINDOW = 600;

    function setUp() public {
        engine = new MockRiskEngine();
        adapter = new MockExitAdapter();
        source = new MockERC20("Tokenized TSLA", "tTSLA", 18);
        target = new MockERC20("USD Coin", "USDC", 18);

        vault = new AegisVault(admin, address(engine));
        vault.setAdapterAllowed(address(adapter), true);
        vault.grantRole(vault.KEEPER_ROLE(), keeper);

        // Fund the user and have them grant a bounded allowance, then arm.
        source.mint(user, 5_000e18);
        vm.startPrank(user);
        source.approve(address(vault), type(uint256).max);
        vault.arm(address(source), address(target), address(adapter), CAP, WINDOW);
        vm.stopPrank();
    }

    // ----------------------------- helpers --------------------------------

    function _signals()
        internal
        pure
        returns (uint8[] memory s, uint8[] memory c, uint256[] memory sev, uint256[] memory conf, uint256[] memory age)
    {
        s = new uint8[](2);
        c = new uint8[](2);
        sev = new uint256[](2);
        conf = new uint256[](2);
        age = new uint256[](2);
        s[0] = 0; // Forta
        s[1] = 1; // Hypernative
        c[0] = 1; // FlashLoanOracle
        c[1] = 1;
        sev[0] = 9_000;
        sev[1] = 9_000;
        conf[0] = 9_000;
        conf[1] = 9_000;
        age[0] = 0;
        age[1] = 0;
    }

    function _evaluate() internal returns (uint8 tier) {
        (uint8[] memory s, uint8[] memory c, uint256[] memory sev, uint256[] memory conf, uint256[] memory age) =
            _signals();
        vm.prank(keeper);
        return vault.evaluateAndExit(user, s, c, sev, conf, age);
    }

    // ------------------------------ tests ---------------------------------

    function test_AutoFire_ExecutesBoundedExit() public {
        engine.setDecision(8_200, 3, true);

        uint256 srcBefore = source.balanceOf(user);
        uint8 tier = _evaluate();

        assertEq(tier, 3, "tier should be auto-fire");
        // Bounded by CAP (< balance), so exactly CAP moves.
        assertEq(source.balanceOf(user), srcBefore - CAP, "source reduced by cap");
        assertEq(target.balanceOf(user), CAP, "user received proceeds 1:1");
    }

    function test_Alert_DoesNotMoveFunds() public {
        engine.setDecision(3_000, 1, false);

        uint256 srcBefore = source.balanceOf(user);
        uint8 tier = _evaluate();

        assertEq(tier, 1, "tier should be alert");
        assertEq(source.balanceOf(user), srcBefore, "no funds moved on alert");
        assertEq(target.balanceOf(user), 0, "no proceeds on alert");
    }

    function test_Confirm_OpensWindow_ThenUserConfirms() public {
        engine.setDecision(5_500, 2, false);

        uint8 tier = _evaluate();
        assertEq(tier, 2, "tier should be confirm");
        assertTrue(vault.isWindowOpen(user), "window should be open");
        assertEq(target.balanceOf(user), 0, "no exit before confirmation");

        // User confirms within the window -> bounded exit fires.
        vm.prank(user);
        vault.confirmExit(user);
        assertEq(target.balanceOf(user), CAP, "exit fires on confirm");
        assertFalse(vault.isWindowOpen(user), "window cleared after confirm");
    }

    function test_Confirm_RevertsAfterWindowExpiry() public {
        engine.setDecision(5_500, 2, false);
        _evaluate();

        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(user);
        vm.expectRevert(AegisVault.NoOpenWindow.selector);
        vault.confirmExit(user);
    }

    function test_Bound_CapIsEnforcedWhenBalanceLarger() public {
        engine.setDecision(9_000, 3, true);
        // user has 5000e18, cap is 1000e18 -> only cap exits, repeatedly capped.
        _evaluate();
        assertEq(target.balanceOf(user), CAP, "first exit capped");
    }

    function test_Bound_AmountIsMinOfBalanceAndCap() public {
        // Drain user down to below the cap, then fire: amount must equal balance.
        vm.prank(user);
        source.transfer(address(0xdead), 4_600e18); // leaves 400e18 < CAP
        engine.setDecision(9_000, 3, true);

        _evaluate();
        assertEq(target.balanceOf(user), 400e18, "amount min(balance, cap)");
        assertEq(source.balanceOf(user), 0, "source fully unwound");
    }

    function test_OnlyKeeper_CanEvaluate() public {
        engine.setDecision(9_000, 3, true);
        (uint8[] memory s, uint8[] memory c, uint256[] memory sev, uint256[] memory conf, uint256[] memory age) =
            _signals();
        vm.prank(user); // not a keeper
        vm.expectRevert();
        vault.evaluateAndExit(user, s, c, sev, conf, age);
    }

    function test_NotArmed_Reverts() public {
        address stranger = makeAddr("stranger");
        engine.setDecision(9_000, 3, true);
        (uint8[] memory s, uint8[] memory c, uint256[] memory sev, uint256[] memory conf, uint256[] memory age) =
            _signals();
        vm.prank(keeper);
        vm.expectRevert(AegisVault.NotArmed.selector);
        vault.evaluateAndExit(stranger, s, c, sev, conf, age);
    }

    function test_Arm_RevertsForDisallowedAdapter() public {
        MockExitAdapter rogue = new MockExitAdapter();
        vm.prank(user);
        vm.expectRevert(AegisVault.AdapterNotAllowed.selector);
        vault.arm(address(source), address(target), address(rogue), CAP, WINDOW);
    }

    function test_Disarm_ClearsGuardAndWindow() public {
        engine.setDecision(5_500, 2, false);
        _evaluate();
        assertTrue(vault.isWindowOpen(user));

        vm.prank(user);
        vault.disarm();

        AegisVault.Guard memory g = vault.guardOf(user);
        assertFalse(g.armed, "guard cleared");
        assertFalse(vault.isWindowOpen(user), "window cleared");
    }

    function test_CheckOracle_ReturnsDeviationViaEngine() public {
        // Sequencer up (answer 0) and started long ago (past grace period).
        MockAggregatorV3 sequencer = new MockAggregatorV3(0, 0);
        sequencer.setStartedAt(1);
        vault.setSequencerFeed(address(sequencer));

        // Feed reports 1900e8 vs an expected 2000e8 -> 5% deviation = 500 bps.
        MockAggregatorV3 feed = new MockAggregatorV3(1_900e8, 8);
        uint256 dev = vault.checkOracle(address(feed), 2_000e8);
        assertEq(dev, 500, "5% deviation == 500 bps");
    }

    function test_CheckOracle_RevertsWhenSequencerDown() public {
        MockAggregatorV3 sequencer = new MockAggregatorV3(1, 0); // 1 == down
        sequencer.setStartedAt(1);
        vault.setSequencerFeed(address(sequencer));

        MockAggregatorV3 feed = new MockAggregatorV3(2_000e8, 8);
        vm.expectRevert(bytes("Aegis: sequencer down"));
        vault.checkOracle(address(feed), 2_000e8);
    }
}
