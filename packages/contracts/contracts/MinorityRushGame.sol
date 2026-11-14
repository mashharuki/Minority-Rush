// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint64, externalEuint8, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/// @dev Minimal view of RushChip's ERC7984ObserverAccess extension.
interface IObserverAccess {
    function observer(address account) external view returns (address);
}

/// @title MinorityRushGame
/// @notice Pick SUN or MOON and stake chips, both encrypted. The side with the SMALLER total stake wins;
///         winners are paid 2x their stake. A tie is broken by on-chain encrypted randomness.
/// @dev Public: round timing, player addresses/count, status, final winning side.
///      Private: each player's side, stake, reward and the per-side pools.
///      Players must first call `RushChip.setOperator(game, until)`.
///      Smart-account players register their owner EOA as chip observer; the game then also grants that observer
///      ACL access to the player's choice, stake and reward (so the owner EOA can decrypt them).
contract MinorityRushGame is ZamaEthereumConfig {
    enum Status {
        None,
        Open,
        Closing, // pools compared, waiting for public decryption of the winner
        Settled,
        Cancelled // fewer than minPlayers entered: stakes are refunded
    }

    struct Round {
        uint64 startTime;
        uint64 endTime;
        Status status;
        uint16 playerCount;
        bool moonWon; // meaningful once Settled
        euint64 sunPool;
        euint64 moonPool;
        ebool moonWinsEnc; // publicly decryptable once Closing
    }

    struct Entry {
        bool entered;
        bool claimed;
        euint8 choice; // 0 = SUN, 1 = MOON
        euint64 stake;
        euint64 reward;
    }

    uint64 public constant MIN_STAKE = 1;
    uint64 public constant MAX_STAKE = 10;

    IERC7984 public immutable chip;
    uint32 public immutable windowSeconds;
    uint16 public immutable minPlayers;
    uint16 public immutable maxPlayers;

    uint256 private constant DAY = 1 days;
    /// @dev A round must stay open at least this long beyond the start window (bounds window vs. deadline gap).
    uint256 private constant MIN_ROUND_SECONDS = 1800;

    /// @dev Round deadlines as seconds after 00:00 UTC, strictly ascending, each < 86400.
    uint32[] private _deadlines;

    uint256 public latestRoundId;
    mapping(uint256 => Round) private _rounds;
    mapping(uint256 => address[]) private _players;
    mapping(uint256 => mapping(address => Entry)) private _entries;

    event RoundStarted(uint256 indexed roundId, uint64 endTime);
    event Entered(uint256 indexed roundId, address indexed player);
    event RoundClosing(uint256 indexed roundId, bytes32 moonWinsHandle);
    event RoundSettled(uint256 indexed roundId, bool moonWon);
    event RoundCancelled(uint256 indexed roundId);
    event Claimed(uint256 indexed roundId, address indexed player);

    error BadSchedule();
    error OutsideWindow();
    error RoundAlreadyStarted();
    error RoundNotFinished();
    error RoundNotOpen();
    error RoundStillActive();
    error RoundNotClosing();
    error RoundNotClaimable();
    error RoundFull();
    error AlreadyEntered();
    error AlreadyClaimed();
    error NotEntered();
    error GameNotOperator();

    constructor(
        IERC7984 chip_,
        uint32[] memory deadlinesUtc_,
        uint32 windowSeconds_,
        uint16 minPlayers_,
        uint16 maxPlayers_
    ) {
        if (minPlayers_ < 2 || maxPlayers_ < minPlayers_ || windowSeconds_ == 0) revert BadSchedule();
        uint256 count = deadlinesUtc_.length;
        if (count == 0 || deadlinesUtc_[count - 1] >= DAY) revert BadSchedule();

        uint256 smallestGap = DAY - deadlinesUtc_[count - 1] + deadlinesUtc_[0];
        for (uint256 i = 1; i < count; i++) {
            if (deadlinesUtc_[i] <= deadlinesUtc_[i - 1]) revert BadSchedule();
            uint256 gap = deadlinesUtc_[i] - deadlinesUtc_[i - 1];
            if (gap < smallestGap) smallestGap = gap;
        }
        if (uint256(windowSeconds_) + MIN_ROUND_SECONDS > smallestGap) revert BadSchedule();

        chip = chip_;
        _deadlines = deadlinesUtc_;
        windowSeconds = windowSeconds_;
        minPlayers = minPlayers_;
        maxPlayers = maxPlayers_;
    }

    // ───────────────────────── Schedule ─────────────────────────

    function schedule() external view returns (uint32[] memory deadlinesUtc, uint32 window) {
        return (_deadlines, windowSeconds);
    }

    /// @notice First deadline strictly after `ts`, wrapping to the first deadline of the next day.
    function nextDeadline(uint64 ts) public view returns (uint64) {
        uint256 day = ts / DAY;
        uint256 secondOfDay = ts % DAY;
        uint256 count = _deadlines.length;
        for (uint256 i = 0; i < count; i++) {
            if (_deadlines[i] > secondOfDay) return uint64(day * DAY + _deadlines[i]);
        }
        return uint64((day + 1) * DAY + _deadlines[0]);
    }

    // ───────────────────────── Round lifecycle ─────────────────────────

    /// @notice Open the round for the next fixed deadline. Only callable inside that deadline's start window,
    ///         and only while no round is Open (a Closing round does not block it).
    function startRound() external returns (uint256 roundId) {
        uint64 end = nextDeadline(uint64(block.timestamp));
        if (block.timestamp < uint256(end) - windowSeconds) revert OutsideWindow();
        if (latestRoundId != 0) {
            Round storage last = _rounds[latestRoundId];
            if (last.status == Status.Open) revert RoundStillActive();
            if (last.endTime == end) revert RoundAlreadyStarted();
        }
        roundId = ++latestRoundId;
        Round storage r = _rounds[roundId];
        r.startTime = uint64(block.timestamp);
        r.endTime = end;
        r.status = Status.Open;
        r.sunPool = FHE.asEuint64(0);
        r.moonPool = FHE.asEuint64(0);
        FHE.allowThis(r.sunPool);
        FHE.allowThis(r.moonPool);
        emit RoundStarted(roundId, r.endTime);
    }

    /// @notice Seal a stake: encrypted side + encrypted amount, pulled from the caller's chip balance.
    /// @param choiceExt encrypted side (0 = SUN, 1 = MOON)
    /// @param stakeExt  encrypted stake, clamped to [MIN_STAKE, MAX_STAKE]
    /// @dev If the caller's balance is too small the chip transfers 0 (no revert, no leak) and the entry stakes 0.
    function enter(
        uint256 roundId,
        externalEuint8 choiceExt,
        externalEuint64 stakeExt,
        bytes calldata inputProof
    ) external {
        Round storage r = _rounds[roundId];
        if (r.status != Status.Open || block.timestamp >= r.endTime) revert RoundNotOpen();
        Entry storage e = _entries[roundId][msg.sender];
        if (e.entered) revert AlreadyEntered();
        if (r.playerCount >= maxPlayers) revert RoundFull();
        if (!chip.isOperator(msg.sender, address(this))) revert GameNotOperator();

        e.entered = true;
        r.playerCount++;
        _players[roundId].push(msg.sender);

        euint8 choice = FHE.fromExternal(choiceExt, inputProof);
        euint64 requested = FHE.min(FHE.max(FHE.fromExternal(stakeExt, inputProof), MIN_STAKE), MAX_STAKE);

        // Pull chips; credit what was ACTUALLY transferred, never the requested amount.
        FHE.allowTransient(requested, address(chip));
        euint64 stake = chip.confidentialTransferFrom(msg.sender, address(this), requested);

        ebool isMoon = FHE.eq(choice, 1);
        euint64 zero = FHE.asEuint64(0);
        r.sunPool = FHE.add(r.sunPool, FHE.select(isMoon, zero, stake));
        r.moonPool = FHE.add(r.moonPool, FHE.select(isMoon, stake, zero));
        FHE.allowThis(r.sunPool);
        FHE.allowThis(r.moonPool);

        e.choice = choice;
        e.stake = stake;
        FHE.allowThis(choice);
        FHE.allowThis(stake);
        FHE.allow(choice, msg.sender);
        FHE.allow(stake, msg.sender);
        address entryObserver = IObserverAccess(address(chip)).observer(msg.sender);
        if (entryObserver != address(0)) {
            FHE.allow(choice, entryObserver);
            FHE.allow(stake, entryObserver);
        }

        emit Entered(roundId, msg.sender);
    }

    /// @notice After the deadline (anyone): compare pools, break a tie with encrypted randomness, request reveal.
    function closeRound(uint256 roundId) external {
        Round storage r = _rounds[roundId];
        if (r.status != Status.Open) revert RoundNotOpen();
        if (block.timestamp < r.endTime) revert RoundNotFinished();

        if (r.playerCount < minPlayers) {
            r.status = Status.Cancelled;
            emit RoundCancelled(roundId);
            return;
        }

        ebool moonSmaller = FHE.lt(r.moonPool, r.sunPool);
        ebool isTie = FHE.eq(r.moonPool, r.sunPool);
        ebool coin = FHE.randEbool(); // only matters on a tie
        ebool moonWins = FHE.select(isTie, coin, moonSmaller);

        r.moonWinsEnc = FHE.makePubliclyDecryptable(moonWins);
        r.status = Status.Closing;
        emit RoundClosing(roundId, FHE.toBytes32(moonWins));
    }

    /// @notice Publish the decrypted winner. `decryptionProof` comes from the Zama public-decryption service.
    function finalizeRound(uint256 roundId, bool moonWon, bytes calldata decryptionProof) external {
        Round storage r = _rounds[roundId];
        if (r.status != Status.Closing) revert RoundNotClosing();

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(r.moonWinsEnc);
        FHE.checkSignatures(handles, abi.encode(moonWon), decryptionProof);

        r.moonWon = moonWon;
        r.status = Status.Settled;
        emit RoundSettled(roundId, moonWon);
    }

    /// @notice Collect your (private) payout: 2x stake if you were on the winning side, else 0.
    ///         Cancelled rounds refund the stake.
    function claim(uint256 roundId) external {
        Round storage r = _rounds[roundId];
        Entry storage e = _entries[roundId][msg.sender];
        if (!e.entered) revert NotEntered();
        if (e.claimed) revert AlreadyClaimed();

        euint64 reward;
        if (r.status == Status.Settled) {
            ebool isMoon = FHE.eq(e.choice, 1);
            ebool won = r.moonWon ? isMoon : FHE.not(isMoon);
            reward = FHE.select(won, FHE.mul(e.stake, 2), FHE.asEuint64(0));
        } else if (r.status == Status.Cancelled) {
            reward = e.stake;
        } else {
            revert RoundNotClaimable();
        }
        e.claimed = true;

        e.reward = reward;
        FHE.allowThis(reward);
        FHE.allow(reward, msg.sender);
        address rewardObserver = IObserverAccess(address(chip)).observer(msg.sender);
        if (rewardObserver != address(0)) FHE.allow(reward, rewardObserver);
        FHE.allowTransient(reward, address(chip));
        chip.confidentialTransfer(msg.sender, reward);

        emit Claimed(roundId, msg.sender);
    }

    // ───────────────────────── Views ─────────────────────────

    function getRound(
        uint256 roundId
    )
        external
        view
        returns (
            uint64 startTime,
            uint64 endTime,
            Status status,
            uint16 playerCount,
            bool moonWon,
            bytes32 moonWinsHandle
        )
    {
        Round storage r = _rounds[roundId];
        return (r.startTime, r.endTime, r.status, r.playerCount, r.moonWon, FHE.toBytes32(r.moonWinsEnc));
    }

    function getPlayers(uint256 roundId) external view returns (address[] memory) {
        return _players[roundId];
    }

    /// @notice Encrypted handles; only the player (and this contract) can decrypt them.
    function getEntry(
        uint256 roundId,
        address player
    ) external view returns (bool entered, bool claimed, euint8 choice, euint64 stake, euint64 reward) {
        Entry storage e = _entries[roundId][player];
        return (e.entered, e.claimed, e.choice, e.stake, e.reward);
    }
}
