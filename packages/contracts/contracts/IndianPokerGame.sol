// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/// @dev Minimal view of RushChip's ERC7984ObserverAccess extension.
interface IObserverAccess {
    function observer(address account) external view returns (address);
}

/// @title IndianPokerGame
/// @notice Heads-up Indian poker: each player's card is readable by the OPPONENT only, never by its holder.
///         One hand per table, Kuhn-style betting (no raises), 2 chips escrowed per player.
/// @dev Public: player addresses, table phase, betting history, timing, final winner, whether each deposit was paid.
///      Private: both cards (never made publicly decryptable) and every chip balance.
///      Players must first call `RushChip.setOperator(game, until)`.
contract IndianPokerGame is ZamaEthereumConfig {
    enum Phase {
        None,
        Open, // waiting for an opponent
        Betting, // dealt, players are acting
        Ended, // betting is over, waiting for settlement
        Settled,
        Voided, // a deposit was missing: everybody gets back what they paid
        Cancelled // creator withdrew before anyone joined
    }

    enum Action {
        Check,
        Bet,
        Call,
        Fold
    }

    struct Table {
        address a;
        address b;
        address opponent; // address(0): anyone may join
        Phase phase;
        uint8 turn; // 0 = A, 1 = B
        uint64 turnDeadline;
        uint8 contribA;
        uint8 contribB;
        bool fundsConfirmed;
        bool aWon;
        bool showdown; // true: decided by card comparison, false: someone folded or timed out
        uint8 loserSeat; // meaningful for a fold/timeout end (0 = A, 1 = B)
        Action[] history;
        euint8 cardA;
        euint8 cardB;
        euint64 paidA;
        euint64 paidB;
        ebool okA;
        ebool okB;
        ebool aWins;
    }

    /// @dev Flat, ABI-friendly snapshot of a table (everything public).
    struct TableInfo {
        address a;
        address b;
        Phase phase;
        uint8 turn;
        uint64 turnDeadline;
        uint8 contribA;
        uint8 contribB;
        Action[] history;
        bool fundsConfirmed;
        bool aWon;
        bool showdown;
        uint8 loserSeat;
    }

    uint64 public constant ANTE = 1;
    uint64 public constant BET = 1;
    uint64 public constant DEPOSIT = 2;
    uint64 public constant TURN_SECONDS = 45;
    uint256 public constant OPEN_LIST_SIZE = 20;

    IERC7984 public immutable chip;
    uint256 public tableCount;
    mapping(uint256 => Table) private _tables;

    event TableCreated(uint256 indexed id, address indexed a, address opponent);
    event TableJoined(uint256 indexed id, address indexed b);
    event TableCancelled(uint256 indexed id);
    event Acted(uint256 indexed id, uint8 seat, Action action);
    /// @dev loserSeat is 2 for a showdown (nobody folded).
    event Ended(uint256 indexed id, bool showdown, uint8 loserSeat);
    event FundsConfirmed(uint256 indexed id, bool ok);
    /// @dev winnerSeat: 0 = A, 1 = B.
    event Settled(uint256 indexed id, uint8 winnerSeat);
    event Voided(uint256 indexed id);

    error TableFull();
    error NotOpen();
    error NotCreator();
    error NotInvited();
    error SelfJoin();
    error GameNotOperator();
    error NotBetting();
    error NotYourTurn();
    error IllegalAction();
    error DeadlineNotReached();
    error FundsNotConfirmed();
    error AlreadyConfirmed();
    error NotEnded();

    constructor(IERC7984 chip_) {
        chip = chip_;
    }

    // ───────────────────────── Tables ─────────────────────────

    /// @notice Open a table and escrow the deposit. `opponent` reserves the seat (address(0) = anyone).
    function createTable(address opponent) external returns (uint256 id) {
        id = ++tableCount;
        Table storage t = _tables[id];
        t.a = msg.sender;
        t.opponent = opponent;
        t.phase = Phase.Open;
        (t.paidA, t.okA) = _pullDeposit(msg.sender);
        emit TableCreated(id, msg.sender, opponent);
    }

    /// @notice Take the second seat: escrow the deposit and deal both cards in this transaction.
    function joinTable(uint256 id) external {
        Table storage t = _tables[id];
        if (t.phase == Phase.Betting) revert TableFull();
        if (t.phase != Phase.Open) revert NotOpen();
        if (msg.sender == t.a) revert SelfJoin();
        if (t.opponent != address(0) && t.opponent != msg.sender) revert NotInvited();

        t.b = msg.sender;
        (t.paidB, t.okB) = _pullDeposit(msg.sender);
        FHE.makePubliclyDecryptable(t.okA);
        FHE.makePubliclyDecryptable(t.okB);
        _deal(t);

        t.phase = Phase.Betting;
        t.contribA = uint8(ANTE);
        t.contribB = uint8(ANTE);
        t.turn = 0;
        t.turnDeadline = uint64(block.timestamp) + TURN_SECONDS;
        emit TableJoined(id, msg.sender);
    }

    /// @notice Creator takes the table down before anyone joined; the deposit comes back.
    function cancelTable(uint256 id) external {
        Table storage t = _tables[id];
        if (t.phase != Phase.Open) revert NotOpen();
        if (msg.sender != t.a) revert NotCreator();
        t.phase = Phase.Cancelled;
        _refund(t.a, t.paidA);
        emit TableCancelled(id);
    }

    // ───────────────────────── Betting ─────────────────────────

    /// @notice Kuhn betting, no raises. A: check|bet. After a bet: call|fold. After A checks, B: check|bet,
    ///         and if B bets, A: call|fold. A fold ends the hand; a call or check-check goes to showdown.
    function act(uint256 id, Action action) external {
        Table storage t = _tables[id];
        if (t.phase != Phase.Betting) revert NotBetting();
        uint8 seat = msg.sender == t.a ? 0 : (msg.sender == t.b ? 1 : 2);
        if (seat != t.turn) revert NotYourTurn();
        if (!_isLegal(t.history, action)) revert IllegalAction();

        bool isCheckCheck = action == Action.Check && t.history.length == 1 && t.history[0] == Action.Check;
        t.history.push(action);
        emit Acted(id, seat, action);

        if (action == Action.Bet || action == Action.Call) {
            if (seat == 0) t.contribA += uint8(BET);
            else t.contribB += uint8(BET);
        }

        if (action == Action.Fold) {
            _end(id, t, false, seat);
        } else if (action == Action.Call || isCheckCheck) {
            _end(id, t, true, 2);
        } else {
            t.turn = 1 - t.turn;
            t.turnDeadline = uint64(block.timestamp) + TURN_SECONDS;
        }
    }

    /// @notice Anyone may end the hand once the player on turn ran out of time: that player loses.
    function claimTimeout(uint256 id) external {
        Table storage t = _tables[id];
        if (t.phase != Phase.Betting) revert NotBetting();
        if (block.timestamp <= t.turnDeadline) revert DeadlineNotReached();
        _end(id, t, false, t.turn);
    }

    // ───────────────────────── Settlement ─────────────────────────

    /// @notice Publishes whether both deposits were paid in full (public decryption proof of the two flags).
    ///         Runs in the background while the hand is played. A missing deposit voids the hand.
    function confirmFunds(uint256 id, bool okA, bool okB, bytes calldata proof) external {
        Table storage t = _tables[id];
        if (t.phase != Phase.Betting && t.phase != Phase.Ended) revert NotBetting();
        if (t.fundsConfirmed) revert AlreadyConfirmed();

        bytes32[] memory handles = new bytes32[](2);
        handles[0] = FHE.toBytes32(t.okA);
        handles[1] = FHE.toBytes32(t.okB);
        FHE.checkSignatures(handles, abi.encode(okA, okB), proof);
        t.fundsConfirmed = true;
        emit FundsConfirmed(id, okA && okB);

        if (!(okA && okB)) {
            t.phase = Phase.Voided;
            _refund(t.a, t.paidA);
            _refund(t.b, t.paidB);
            emit Voided(id);
            return;
        }
        if (t.phase == Phase.Ended && !t.showdown) _settle(id, t, t.loserSeat == 1);
    }

    /// @notice Settles a showdown with the public-decryption proof of the single `aWins` bit.
    function finalizeShowdown(uint256 id, bool aWins, bytes calldata proof) external {
        Table storage t = _tables[id];
        if (t.phase != Phase.Ended || !t.showdown) revert NotEnded();
        if (!t.fundsConfirmed) revert FundsNotConfirmed();

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(t.aWins);
        FHE.checkSignatures(handles, abi.encode(aWins), proof);
        _settle(id, t, aWins);
    }

    // ───────────────────────── Views ─────────────────────────

    /// @notice The newest (up to OPEN_LIST_SIZE) tables that still wait for any opponent, newest first.
    function getOpenTables() external view returns (uint256[] memory ids) {
        uint256 count = tableCount;
        uint256 from = count > OPEN_LIST_SIZE ? count - OPEN_LIST_SIZE + 1 : 1;
        uint256[] memory tmp = new uint256[](OPEN_LIST_SIZE);
        uint256 n;
        for (uint256 id = count; id >= from && id != 0; id--) {
            Table storage t = _tables[id];
            if (t.phase == Phase.Open && t.opponent == address(0)) tmp[n++] = id;
        }
        ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) ids[i] = tmp[i];
    }

    function getTable(uint256 id) external view returns (TableInfo memory info) {
        Table storage t = _tables[id];
        info = TableInfo({
            a: t.a,
            b: t.b,
            phase: t.phase,
            turn: t.turn,
            turnDeadline: t.turnDeadline,
            contribA: t.contribA,
            contribB: t.contribB,
            history: t.history,
            fundsConfirmed: t.fundsConfirmed,
            aWon: t.aWon,
            showdown: t.showdown,
            loserSeat: t.loserSeat
        });
    }

    /// @notice Handles are public; only ACL-allowed accounts can decrypt them.
    function getCardHandles(uint256 id) external view returns (euint8 cardA, euint8 cardB) {
        return (_tables[id].cardA, _tables[id].cardB);
    }

    function getShowdownHandle(uint256 id) external view returns (ebool aWins) {
        return _tables[id].aWins;
    }

    function getFundsHandles(uint256 id) external view returns (ebool okA, ebool okB) {
        return (_tables[id].okA, _tables[id].okB);
    }

    // ───────────────────────── Internals ─────────────────────────

    /// @dev Legal moves by betting history (see `act`).
    function _isLegal(Action[] storage h, Action action) private view returns (bool) {
        uint256 n = h.length;
        if (n == 0) return action == Action.Check || action == Action.Bet;
        if (n == 1) {
            if (h[0] == Action.Bet) return action == Action.Call || action == Action.Fold;
            return action == Action.Check || action == Action.Bet; // h[0] == Check
        }
        if (n == 2) return action == Action.Call || action == Action.Fold; // Check, Bet
        return false;
    }

    /// @dev Betting is over. A showdown compares the cards under FHE and publishes only that one bit.
    function _end(uint256 id, Table storage t, bool showdown, uint8 loserSeat) private {
        t.phase = Phase.Ended;
        t.showdown = showdown;
        t.loserSeat = loserSeat;
        if (showdown) {
            t.aWins = FHE.gt(t.cardA, t.cardB);
            FHE.allowThis(t.aWins);
            FHE.makePubliclyDecryptable(t.aWins);
        }
        emit Ended(id, showdown, loserSeat);
        if (!showdown && t.fundsConfirmed) _settle(id, t, loserSeat == 1);
    }

    /// @dev Pays out in plain units decided by the public betting record: each player gets back the unused part
    ///      of the deposit, the winner also gets everything that was put in the pot.
    function _settle(uint256 id, Table storage t, bool aWon) private {
        t.phase = Phase.Settled;
        t.aWon = aWon;
        uint64 pot = uint64(t.contribA) + uint64(t.contribB);
        _pay(t.a, (DEPOSIT - t.contribA) + (aWon ? pot : 0));
        _pay(t.b, (DEPOSIT - t.contribB) + (aWon ? 0 : pot));
        emit Settled(id, aWon ? 0 : 1);
    }

    function _pay(address to, uint64 units) private {
        if (units == 0) return;
        euint64 amount = FHE.asEuint64(units);
        FHE.allowTransient(amount, address(chip));
        chip.confidentialTransfer(to, amount);
    }

    function _refund(address to, euint64 paid) private {
        FHE.allowTransient(paid, address(chip));
        chip.confidentialTransfer(to, paid);
    }

    /// @dev Pulls DEPOSIT chips. ERC-7984 moves 0 instead of reverting on a short balance, so we keep the amount
    ///      actually transferred and an encrypted "paid in full" flag (decrypted publicly after the deal).
    function _pullDeposit(address from) private returns (euint64 paid, ebool ok) {
        if (!chip.isOperator(from, address(this))) revert GameNotOperator();
        euint64 requested = FHE.asEuint64(DEPOSIT);
        FHE.allowTransient(requested, address(chip));
        paid = chip.confidentialTransferFrom(from, address(this), requested);
        ok = FHE.eq(paid, DEPOSIT);
        FHE.allowThis(paid);
        FHE.allowThis(ok);
    }

    /// @dev Two distinct cards from 1..13 drawn without replacement: a in 0..12, b in 0..11 shifted past a.
    ///      Each card is readable by the OPPONENT only (and that opponent's chip observer, for smart accounts).
    function _deal(Table storage t) private {
        euint8 a = FHE.asEuint8(FHE.rem(FHE.randEuint64(), 13));
        euint8 b = FHE.asEuint8(FHE.rem(FHE.randEuint64(), 12));
        b = FHE.select(FHE.ge(b, a), FHE.add(b, 1), b);
        t.cardA = FHE.add(a, 1);
        t.cardB = FHE.add(b, 1);
        FHE.allowThis(t.cardA);
        FHE.allowThis(t.cardB);
        _allowWithObserver(t.cardA, t.b);
        _allowWithObserver(t.cardB, t.a);
    }

    function _allowWithObserver(euint8 value, address account) private {
        FHE.allow(value, account);
        address obs = IObserverAccess(address(chip)).observer(account);
        if (obs != address(0)) FHE.allow(value, obs);
    }
}
