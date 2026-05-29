// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IRiskEngine} from "./interfaces/IRiskEngine.sol";
import {IExitAdapter} from "./interfaces/IExitAdapter.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

/// @title  AegisVault
/// @author Aegis
/// @notice The bounded executor for the Aegis crisis-response guardian.
///
///         Aegis follows the "bind the agent, not the keys" principle. A user
///         never hands over custody or an unbounded approval. Instead they:
///           1. grant this vault a *bounded* allowance of the asset to protect,
///           2. `arm` a guard specifying the exit route and a hard per-exit cap.
///
///         A keeper (the agent's delegated session key, scoped via ERC-7715 in
///         production) may then call `evaluateAndExit`. That function asks the
///         Stylus `RiskEngine` for a verdict and is *only* able to move funds if
///         the engine returns an auto-fire decision — and even then, only up to
///         the user's cap, only into the user's chosen asset, and only through an
///         owner-allow-listed adapter. The judgement is on-chain and verifiable;
///         the executor is dumb and tightly bounded by design.
contract AegisVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    // Tier discriminants returned by the engine.
    uint8 internal constant TIER_NONE = 0;
    uint8 internal constant TIER_ALERT = 1;
    uint8 internal constant TIER_CONFIRM = 2;
    uint8 internal constant TIER_AUTOFIRE = 3;

    /// @dev Chainlink-recommended grace period after the L2 sequencer restarts.
    uint256 public constant SEQUENCER_GRACE_PERIOD = 3600;

    /// @notice Per-user guard configuration.
    struct Guard {
        bool armed;
        address sourceAsset; // asset pulled & unwound on exit (e.g. aToken, Stock Token)
        address targetAsset; // asset proceeds are delivered in (e.g. USDC)
        address adapter; // exit adapter used to unwind
        uint256 maxExitAmount; // hard cap on sourceAsset pulled per exit (the bound)
        uint64 t2WindowSecs; // confirmation window for T2 decisions
    }

    /// @notice The verifiable Stylus risk engine.
    IRiskEngine public engine;
    /// @notice ERC-8004 agent id for this guardian (0 until registered).
    uint256 public agentId;
    /// @notice Chainlink L2 sequencer uptime feed (0 to disable the check).
    address public sequencerUptimeFeed;

    /// @notice user => guard config.
    mapping(address => Guard) public guards;
    /// @notice user => T2 confirmation-window expiry timestamp (0 if none open).
    mapping(address => uint256) public pendingUntil;
    /// @notice adapter => allow-listed flag.
    mapping(address => bool) public allowedAdapters;

    event EngineUpdated(address indexed engine);
    event AgentIdUpdated(uint256 indexed agentId);
    event SequencerFeedUpdated(address indexed feed);
    event AdapterAllowed(address indexed adapter, bool allowed);
    event Armed(address indexed user, address sourceAsset, address targetAsset, address adapter, uint256 maxExitAmount, uint64 t2WindowSecs);
    event Disarmed(address indexed user);
    event Evaluated(address indexed user, uint256 scoreBps, uint8 tier, bool exitFlag);
    event Alert(address indexed user, uint256 scoreBps);
    event ConfirmationRequested(address indexed user, uint256 scoreBps, uint256 windowExpiry);
    event Exited(
        address indexed user,
        address indexed adapter,
        address sourceAsset,
        uint256 amount,
        address targetAsset,
        uint256 proceeds,
        uint256 scoreBps,
        uint256 agentId
    );

    error EngineNotSet();
    error NotArmed();
    error AdapterNotAllowed();
    error NothingToExit();
    error NotAuthorized();
    error NoOpenWindow();
    error ZeroAddress();

    constructor(address admin, address engine_) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KEEPER_ROLE, admin); // admin can keep until a session key is delegated
        engine = IRiskEngine(engine_);
        emit EngineUpdated(engine_);
    }

    // --------------------------- admin config -----------------------------

    function setEngine(address engine_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (engine_ == address(0)) revert ZeroAddress();
        engine = IRiskEngine(engine_);
        emit EngineUpdated(engine_);
    }

    /// @notice Record the ERC-8004 identity NFT id minted for this guardian.
    function setAgentId(uint256 agentId_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        agentId = agentId_;
        emit AgentIdUpdated(agentId_);
    }

    function setSequencerFeed(address feed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        sequencerUptimeFeed = feed;
        emit SequencerFeedUpdated(feed);
    }

    function setAdapterAllowed(address adapter, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        allowedAdapters[adapter] = allowed;
        emit AdapterAllowed(adapter, allowed);
    }

    // ------------------------------ arming --------------------------------

    /// @notice Arm a guard for the caller. The caller must separately grant this
    ///         vault an ERC-20 allowance of `sourceAsset` (>= `maxExitAmount`).
    ///         No funds are moved here — only a bounded mandate is recorded.
    function arm(
        address sourceAsset,
        address targetAsset,
        address adapter,
        uint256 maxExitAmount,
        uint64 t2WindowSecs
    ) external {
        if (sourceAsset == address(0) || targetAsset == address(0) || adapter == address(0)) {
            revert ZeroAddress();
        }
        if (!allowedAdapters[adapter]) revert AdapterNotAllowed();
        guards[msg.sender] = Guard({
            armed: true,
            sourceAsset: sourceAsset,
            targetAsset: targetAsset,
            adapter: adapter,
            maxExitAmount: maxExitAmount,
            t2WindowSecs: t2WindowSecs
        });
        emit Armed(msg.sender, sourceAsset, targetAsset, adapter, maxExitAmount, t2WindowSecs);
    }

    /// @notice Disarm the caller's guard and clear any open confirmation window.
    function disarm() external {
        delete guards[msg.sender];
        delete pendingUntil[msg.sender];
        emit Disarmed(msg.sender);
    }

    // ---------------------------- evaluation ------------------------------

    /// @notice Keeper entrypoint. Asks the engine for a verdict and acts on it.
    ///         Calls `engine.evaluate` (not the view) so the decision is logged
    ///         on-chain by the engine itself. Funds move only on an auto-fire.
    /// @return tier the engine's response tier (0..3)
    function evaluateAndExit(
        address user,
        uint8[] calldata sources,
        uint8[] calldata classes,
        uint256[] calldata severitiesBps,
        uint256[] calldata confidencesBps,
        uint256[] calldata agesSecs
    ) external onlyRole(KEEPER_ROLE) nonReentrant returns (uint8 tier) {
        if (address(engine) == address(0)) revert EngineNotSet();
        Guard memory g = guards[user];
        if (!g.armed) revert NotArmed();

        uint256 scoreBps;
        bool exitFlag;
        (scoreBps, tier, exitFlag) =
            engine.evaluate(sources, classes, severitiesBps, confidencesBps, agesSecs);
        emit Evaluated(user, scoreBps, tier, exitFlag);

        if (exitFlag) {
            _executeExit(user, g, scoreBps);
        } else if (tier == TIER_CONFIRM) {
            uint256 windowExpiry = block.timestamp + g.t2WindowSecs;
            pendingUntil[user] = windowExpiry;
            emit ConfirmationRequested(user, scoreBps, windowExpiry);
        } else if (tier == TIER_ALERT) {
            emit Alert(user, scoreBps);
        }
        // TIER_NONE: no event, nothing to do.
    }

    /// @notice Confirm a pending T2 exit within its window. Callable by the
    ///         protected user themselves, or by the keeper acting on a user
    ///         confirmation relayed off-chain.
    function confirmExit(address user) external nonReentrant {
        if (msg.sender != user && !hasRole(KEEPER_ROLE, msg.sender)) revert NotAuthorized();
        uint256 until = pendingUntil[user];
        if (until == 0 || block.timestamp > until) revert NoOpenWindow();
        Guard memory g = guards[user];
        if (!g.armed) revert NotArmed();
        delete pendingUntil[user];
        _executeExit(user, g, 0);
    }

    // ------------------------- oracle interop -----------------------------

    /// @notice Read a Chainlink feed (guarded by the L2 sequencer uptime feed)
    ///         and return its deviation from `expectedPrice` in bps. The
    ///         deviation math is delegated to the Stylus engine — a live
    ///         Solidity -> Stylus cross-contract call. The agent uses this to
    ///         derive a trustless on-chain oracle-deviation signal.
    function checkOracle(address feed, uint256 expectedPrice)
        external
        view
        returns (uint256 deviationBps)
    {
        if (sequencerUptimeFeed != address(0)) {
            (, int256 up, uint256 startedAt,,) = IAggregatorV3(sequencerUptimeFeed).latestRoundData();
            require(up == 0, "Aegis: sequencer down");
            require(block.timestamp - startedAt > SEQUENCER_GRACE_PERIOD, "Aegis: grace period");
        }
        (, int256 answer,,,) = IAggregatorV3(feed).latestRoundData();
        require(answer > 0, "Aegis: bad price");
        return engine.deviationBps(uint256(answer), expectedPrice);
    }

    // ------------------------------ internal ------------------------------

    function _executeExit(address user, Guard memory g, uint256 scoreBps) internal {
        if (!allowedAdapters[g.adapter]) revert AdapterNotAllowed();

        // Determine the bounded amount: min(approved, balance, cap).
        uint256 approved = IERC20(g.sourceAsset).allowance(user, address(this));
        uint256 bal = IERC20(g.sourceAsset).balanceOf(user);
        uint256 amount = approved < bal ? approved : bal;
        if (amount > g.maxExitAmount) amount = g.maxExitAmount;
        if (amount == 0) revert NothingToExit();

        // Pull exactly the bounded amount (non-custodial: never more than approved).
        IERC20(g.sourceAsset).safeTransferFrom(user, address(this), amount);

        // Hand off to the protocol-specific adapter; proceeds go straight to user.
        IERC20(g.sourceAsset).forceApprove(g.adapter, amount);
        uint256 proceeds = IExitAdapter(g.adapter).exit(g.sourceAsset, amount, g.targetAsset, user);
        IERC20(g.sourceAsset).forceApprove(g.adapter, 0);

        emit Exited(user, g.adapter, g.sourceAsset, amount, g.targetAsset, proceeds, scoreBps, agentId);
    }

    // ------------------------------ views ---------------------------------

    function guardOf(address user) external view returns (Guard memory) {
        return guards[user];
    }

    function isWindowOpen(address user) external view returns (bool) {
        uint256 until = pendingUntil[user];
        return until != 0 && block.timestamp <= until;
    }
}
