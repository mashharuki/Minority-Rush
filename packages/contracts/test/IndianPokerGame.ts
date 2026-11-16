import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import type { IndianPokerGame, RushChip } from "../types";

export const FAR_FUTURE = 2n ** 40n;
export const ANYONE = ethers.ZeroAddress;

export type Fixture = {
  chip: RushChip;
  game: IndianPokerGame;
  chipAddr: string;
  gameAddr: string;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  carol: HardhatEthersSigner;
  dave: HardhatEthersSigner;
};

export async function deployAll(): Promise<Fixture> {
  const [, alice, bob, carol, dave] = await ethers.getSigners();
  const chip = (await (await ethers.getContractFactory("RushChip")).deploy()) as unknown as RushChip;
  const chipAddr = await chip.getAddress();
  const game = (await (
    await ethers.getContractFactory("IndianPokerGame")
  ).deploy(chipAddr)) as unknown as IndianPokerGame;
  return { chip, game, chipAddr, gameAddr: await game.getAddress(), alice, bob, carol, dave };
}

/** Owner mints `amount` chips to the player and the player approves the game as operator. */
export async function fund(f: Fixture, player: HardhatEthersSigner, amount = 20): Promise<void> {
  await f.chip.mint(player.address, amount);
  await f.chip.connect(player).setOperator(f.gameAddr, FAR_FUTURE);
}

export async function balanceOf(f: Fixture, player: HardhatEthersSigner): Promise<bigint> {
  const handle = await f.chip.confidentialBalanceOf(player.address);
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, f.chipAddr, player);
}

/** Alice creates a table (optionally reserved), bob joins: returns the new table id. */
export async function openAndJoin(f: Fixture, opponent: string = ANYONE): Promise<bigint> {
  await f.game.connect(f.alice).createTable(opponent);
  const id = await f.game.tableCount();
  await f.game.connect(f.bob).joinTable(id);
  return id;
}

export async function cardOf(f: Fixture, id: bigint, seat: "A" | "B"): Promise<bigint> {
  const [a, b] = await f.game.getCardHandles(id);
  return fhevm.debugger.decryptEuint(FhevmType.euint8, seat === "A" ? a : b);
}

describe("IndianPokerGame tables", function () {
  let f: Fixture;

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    f = await deployAll();
    await fund(f, f.alice);
    await fund(f, f.bob);
  });

  it("should create an open table and list it when the creator pays the deposit", async function () {
    await f.game.connect(f.alice).createTable(ANYONE);
    const id = await f.game.tableCount();
    expect(id).to.eq(1n);
    expect(await f.game.getOpenTables()).to.deep.eq([1n]);
    expect(await balanceOf(f, f.alice)).to.eq(18n);
  });

  it("should not list a table reserved for an opponent when opponent is set", async function () {
    await f.game.connect(f.alice).createTable(f.bob.address);
    expect(await f.game.getOpenTables()).to.deep.eq([]);
  });

  it("should revert NotInvited when a stranger joins a reserved table", async function () {
    await fund(f, f.carol);
    await f.game.connect(f.alice).createTable(f.bob.address);
    await expect(f.game.connect(f.carol).joinTable(1n)).to.be.revertedWithCustomError(f.game, "NotInvited");
  });

  it("should revert SelfJoin when the creator joins their own table", async function () {
    await f.game.connect(f.alice).createTable(ANYONE);
    await expect(f.game.connect(f.alice).joinTable(1n)).to.be.revertedWithCustomError(f.game, "SelfJoin");
  });

  it("should deal two distinct cards in 1..13 when the second player joins", async function () {
    for (let i = 0; i < 30; i++) {
      await f.chip.mint(f.alice.address, 2);
      await f.chip.mint(f.bob.address, 2);
      const id = await openAndJoin(f);
      const a = Number(await cardOf(f, id, "A"));
      const b = Number(await cardOf(f, id, "B"));
      expect(a).to.be.within(1, 13);
      expect(b).to.be.within(1, 13);
      expect(a).to.not.eq(b);
    }
  });

  it("should let only the opponent decrypt each card when the table is dealt", async function () {
    const id = await openAndJoin(f);
    const [hA, hB] = await f.game.getCardHandles(id);
    const realA = await cardOf(f, id, "A");
    const realB = await cardOf(f, id, "B");
    expect(await fhevm.userDecryptEuint(FhevmType.euint8, hA, f.gameAddr, f.bob)).to.eq(realA);
    expect(await fhevm.userDecryptEuint(FhevmType.euint8, hB, f.gameAddr, f.alice)).to.eq(realB);
    await expect(fhevm.userDecryptEuint(FhevmType.euint8, hA, f.gameAddr, f.alice)).to.be.rejected;
    await expect(fhevm.userDecryptEuint(FhevmType.euint8, hB, f.gameAddr, f.bob)).to.be.rejected;
    await expect(fhevm.userDecryptEuint(FhevmType.euint8, hA, f.gameAddr, f.carol)).to.be.rejected;
    await expect(fhevm.userDecryptEuint(FhevmType.euint8, hB, f.gameAddr, f.carol)).to.be.rejected;
  });

  it("should grant the opponent's chip observer access to the card when an observer is registered", async function () {
    await f.chip.connect(f.bob).setObserver(f.bob.address, f.dave.address);
    const id = await openAndJoin(f);
    const [hA] = await f.game.getCardHandles(id);
    expect(await fhevm.userDecryptEuint(FhevmType.euint8, hA, f.gameAddr, f.dave)).to.eq(await cardOf(f, id, "A"));
  });

  it("should not allow public decryption of cards when the table is dealt", async function () {
    const id = await openAndJoin(f);
    const [hA, hB] = await f.game.getCardHandles(id);
    await expect(fhevm.publicDecrypt([hA])).to.be.rejected;
    await expect(fhevm.publicDecrypt([hB])).to.be.rejected;
  });

  it("should refund the creator when the table is cancelled", async function () {
    await f.game.connect(f.alice).createTable(ANYONE);
    await expect(f.game.connect(f.bob).cancelTable(1n)).to.be.revertedWithCustomError(f.game, "NotCreator");
    await f.game.connect(f.alice).cancelTable(1n);
    expect(await balanceOf(f, f.alice)).to.eq(20n);
    expect(await f.game.getOpenTables()).to.deep.eq([]);
    await expect(f.game.connect(f.bob).joinTable(1n)).to.be.revertedWithCustomError(f.game, "NotOpen");
  });

  it("should revert TableFull when a third player joins", async function () {
    await fund(f, f.carol);
    const id = await openAndJoin(f);
    await expect(f.game.connect(f.carol).joinTable(id)).to.be.revertedWithCustomError(f.game, "TableFull");
  });

  it("should revert GameNotOperator when the joiner did not approve the game", async function () {
    await f.chip.mint(f.carol.address, 20);
    await f.game.connect(f.alice).createTable(ANYONE);
    await expect(f.game.connect(f.carol).joinTable(1n)).to.be.revertedWithCustomError(f.game, "GameNotOperator");
  });
});

const CHECK = 0;
const BET = 1;
const CALL = 2;
const FOLD = 3;
const PHASE_BETTING = 2;
const PHASE_ENDED = 3;

describe("IndianPokerGame betting", function () {
  let f: Fixture;
  let id: bigint;

  const act = (who: HardhatEthersSigner, action: number) => f.game.connect(who).act(id, action);

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    f = await deployAll();
    await fund(f, f.alice);
    await fund(f, f.bob);
    id = await openAndJoin(f);
  });

  async function expectShowdownMatchesCards(): Promise<void> {
    const aWins = await fhevm.publicDecryptEbool(await f.game.getShowdownHandle(id));
    expect(aWins).to.eq((await cardOf(f, id, "A")) > (await cardOf(f, id, "B")));
  }

  it("should start in betting with A on turn and antes counted when the table is dealt", async function () {
    const t = await f.game.getTable(id);
    expect(t.phase).to.eq(PHASE_BETTING);
    expect(t.turn).to.eq(0);
    expect(t.contribA).to.eq(1);
    expect(t.contribB).to.eq(1);
  });

  it("should end in showdown with both contributions raised when A bets and B calls", async function () {
    await act(f.alice, BET);
    await expect(act(f.bob, CALL)).to.emit(f.game, "Ended").withArgs(id, true, 2);
    const t = await f.game.getTable(id);
    expect(t.phase).to.eq(PHASE_ENDED);
    expect([t.contribA, t.contribB]).to.deep.eq([2n, 2n]);
    expect(t.showdown).to.eq(true);
    await expectShowdownMatchesCards();
  });

  it("should end by fold with B as loser when A bets and B folds", async function () {
    await act(f.alice, BET);
    await expect(act(f.bob, FOLD)).to.emit(f.game, "Ended").withArgs(id, false, 1);
    const t = await f.game.getTable(id);
    expect(t.phase).to.eq(PHASE_ENDED);
    expect([t.contribA, t.contribB]).to.deep.eq([2n, 1n]);
    expect(t.showdown).to.eq(false);
  });

  it("should end in showdown with antes only when both players check", async function () {
    await act(f.alice, CHECK);
    await act(f.bob, CHECK);
    const t = await f.game.getTable(id);
    expect(t.phase).to.eq(PHASE_ENDED);
    expect([t.contribA, t.contribB]).to.deep.eq([1n, 1n]);
    expect(t.showdown).to.eq(true);
    await expectShowdownMatchesCards();
  });

  it("should end in showdown when A checks, B bets and A calls", async function () {
    await act(f.alice, CHECK);
    await act(f.bob, BET);
    await act(f.alice, CALL);
    const t = await f.game.getTable(id);
    expect(t.phase).to.eq(PHASE_ENDED);
    expect([t.contribA, t.contribB]).to.deep.eq([2n, 2n]);
    await expectShowdownMatchesCards();
  });

  it("should end by fold with A as loser when A checks, B bets and A folds", async function () {
    await act(f.alice, CHECK);
    await act(f.bob, BET);
    await expect(act(f.alice, FOLD)).to.emit(f.game, "Ended").withArgs(id, false, 0);
    const t = await f.game.getTable(id);
    expect([t.contribA, t.contribB]).to.deep.eq([1n, 2n]);
  });

  it("should revert NotYourTurn when the wrong seat acts", async function () {
    await expect(act(f.bob, CHECK)).to.be.revertedWithCustomError(f.game, "NotYourTurn");
    await expect(act(f.carol, CHECK)).to.be.revertedWithCustomError(f.game, "NotYourTurn");
  });

  it("should revert IllegalAction when the action does not fit the betting state", async function () {
    await expect(act(f.alice, CALL)).to.be.revertedWithCustomError(f.game, "IllegalAction");
    await expect(act(f.alice, FOLD)).to.be.revertedWithCustomError(f.game, "IllegalAction");
    await act(f.alice, BET);
    await expect(act(f.bob, BET)).to.be.revertedWithCustomError(f.game, "IllegalAction");
    await expect(act(f.bob, CHECK)).to.be.revertedWithCustomError(f.game, "IllegalAction");
  });

  it("should revert NotBetting when acting after the hand ended", async function () {
    await act(f.alice, BET);
    await act(f.bob, FOLD);
    await expect(act(f.alice, CHECK)).to.be.revertedWithCustomError(f.game, "NotBetting");
  });

  it("should end the hand with the player on turn losing when claimTimeout is called after 45 s", async function () {
    await time.increase(46);
    await expect(f.game.connect(f.carol).claimTimeout(id)).to.emit(f.game, "Ended").withArgs(id, false, 0);
    expect((await f.game.getTable(id)).phase).to.eq(PHASE_ENDED);
  });

  it("should revert DeadlineNotReached when claimTimeout is called early", async function () {
    await expect(f.game.claimTimeout(id)).to.be.revertedWithCustomError(f.game, "DeadlineNotReached");
  });

  it("should restart the 45 s clock when a player acts", async function () {
    await time.increase(40);
    await act(f.alice, CHECK);
    await time.increase(40);
    await expect(f.game.claimTimeout(id)).to.be.revertedWithCustomError(f.game, "DeadlineNotReached");
  });

  it("should not reveal either card when the hand ends by fold", async function () {
    await act(f.alice, BET);
    await act(f.bob, FOLD);
    const [hA, hB] = await f.game.getCardHandles(id);
    await expect(fhevm.publicDecrypt([hA])).to.be.rejected;
    await expect(fhevm.publicDecrypt([hB])).to.be.rejected;
  });

  it("should keep cards private after a showdown and only publish the comparison", async function () {
    await act(f.alice, CHECK);
    await act(f.bob, CHECK);
    const [hA, hB] = await f.game.getCardHandles(id);
    await expect(fhevm.publicDecrypt([hA])).to.be.rejected;
    await expect(fhevm.publicDecrypt([hB])).to.be.rejected;
  });
});

const PHASE_SETTLED = 4;
const PHASE_VOIDED = 5;

const toBool = (v: unknown): boolean => v === true || v === 1n;

describe("IndianPokerGame settlement", function () {
  let f: Fixture;
  let id: bigint;

  const act = (who: HardhatEthersSigner, action: number) => f.game.connect(who).act(id, action);

  /** Public-decrypts the two funds flags and submits them. Returns the flags. */
  async function confirm(flags?: { okA: boolean; okB: boolean }): Promise<{ okA: boolean; okB: boolean }> {
    const [hA, hB] = await f.game.getFundsHandles(id);
    const res = await fhevm.publicDecrypt([hA, hB]);
    const okA = flags?.okA ?? toBool(res.clearValues[hA as `0x${string}`]);
    const okB = flags?.okB ?? toBool(res.clearValues[hB as `0x${string}`]);
    await f.game.confirmFunds(id, okA, okB, res.decryptionProof);
    return { okA, okB };
  }

  async function showdownProof(): Promise<{ aWins: boolean; proof: string }> {
    const h = await f.game.getShowdownHandle(id);
    const res = await fhevm.publicDecrypt([h]);
    return { aWins: toBool(res.clearValues[h as `0x${string}`]), proof: res.decryptionProof };
  }

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    f = await deployAll();
    await fund(f, f.alice);
  });

  describe("with funded players", function () {
    beforeEach(async function () {
      await fund(f, f.bob);
      id = await openAndJoin(f);
    });

    it("should pay the winner the pot when a called showdown is finalized", async function () {
      await act(f.alice, BET);
      await act(f.bob, CALL);
      await confirm();
      const { aWins, proof } = await showdownProof();
      await expect(f.game.finalizeShowdown(id, aWins, proof)).to.emit(f.game, "Settled").withArgs(id, aWins ? 0 : 1);
      expect((await f.game.getTable(id)).phase).to.eq(PHASE_SETTLED);
      expect(await balanceOf(f, f.alice)).to.eq(aWins ? 22n : 18n);
      expect(await balanceOf(f, f.bob)).to.eq(aWins ? 18n : 22n);
    });

    it("should pay one chip net when both players check and the showdown is finalized", async function () {
      await act(f.alice, CHECK);
      await act(f.bob, CHECK);
      await confirm();
      const { aWins, proof } = await showdownProof();
      await f.game.finalizeShowdown(id, aWins, proof);
      expect(await balanceOf(f, f.alice)).to.eq(aWins ? 21n : 19n);
      expect(await balanceOf(f, f.bob)).to.eq(aWins ? 19n : 21n);
    });

    it("should settle a fold in the act transaction when funds are already confirmed", async function () {
      await confirm();
      await act(f.alice, BET);
      await expect(act(f.bob, FOLD)).to.emit(f.game, "Settled").withArgs(id, 0);
      const t = await f.game.getTable(id);
      expect(t.phase).to.eq(PHASE_SETTLED);
      expect(t.aWon).to.eq(true);
      expect(await balanceOf(f, f.alice)).to.eq(21n);
      expect(await balanceOf(f, f.bob)).to.eq(19n);
    });

    it("should settle a fold when confirmFunds arrives after the fold", async function () {
      await act(f.alice, BET);
      await act(f.bob, FOLD);
      expect((await f.game.getTable(id)).phase).to.eq(PHASE_ENDED);
      await confirm();
      expect((await f.game.getTable(id)).phase).to.eq(PHASE_SETTLED);
      expect(await balanceOf(f, f.alice)).to.eq(21n);
      expect(await balanceOf(f, f.bob)).to.eq(19n);
    });

    it("should settle a timeout in the claimTimeout transaction when funds are already confirmed", async function () {
      await confirm();
      await time.increase(46);
      await f.game.connect(f.carol).claimTimeout(id);
      expect((await f.game.getTable(id)).phase).to.eq(PHASE_SETTLED);
      expect(await balanceOf(f, f.alice)).to.eq(19n);
      expect(await balanceOf(f, f.bob)).to.eq(21n);
    });

    it("should revert FundsNotConfirmed when finalizing before confirmFunds", async function () {
      await act(f.alice, CHECK);
      await act(f.bob, CHECK);
      const { aWins, proof } = await showdownProof();
      await expect(f.game.finalizeShowdown(id, aWins, proof)).to.be.revertedWithCustomError(
        f.game,
        "FundsNotConfirmed",
      );
    });

    it("should revert when a forged result is submitted", async function () {
      await act(f.alice, CHECK);
      await act(f.bob, CHECK);
      await confirm();
      const { aWins, proof } = await showdownProof();
      await expect(f.game.finalizeShowdown(id, !aWins, proof)).to.be.reverted;
    });

    it("should revert NotEnded when finalizeShowdown is replayed", async function () {
      await act(f.alice, CHECK);
      await act(f.bob, CHECK);
      await confirm();
      const { aWins, proof } = await showdownProof();
      await f.game.finalizeShowdown(id, aWins, proof);
      await expect(f.game.finalizeShowdown(id, aWins, proof)).to.be.revertedWithCustomError(f.game, "NotEnded");
    });

    it("should revert NotEnded when finalizeShowdown is called after a fold", async function () {
      await confirm();
      await act(f.alice, BET);
      await act(f.bob, FOLD);
      await expect(f.game.finalizeShowdown(id, true, "0x")).to.be.revertedWithCustomError(f.game, "NotEnded");
    });

    it("should revert AlreadyConfirmed when confirmFunds is submitted twice", async function () {
      await confirm();
      await expect(confirm()).to.be.revertedWithCustomError(f.game, "AlreadyConfirmed");
    });
  });

  describe("with an underfunded player", function () {
    beforeEach(async function () {
      const poor = f.bob;
      await f.chip.mint(poor.address, 1); // 1 chip < DEPOSIT 2: the transfer moves 0
      await f.chip.connect(poor).setOperator(f.gameAddr, FAR_FUTURE);
      await f.game.connect(f.alice).createTable(ANYONE);
      id = await f.game.tableCount();
      await f.game.connect(poor).joinTable(id);
    });

    it("should void the hand and refund what was paid when a deposit was missing", async function () {
      await fund(f, f.carol); // unrelated player proves nothing else moves
      const flags = await confirm();
      expect(flags).to.deep.eq({ okA: true, okB: false });
      expect((await f.game.getTable(id)).phase).to.eq(PHASE_VOIDED);
      expect(await balanceOf(f, f.alice)).to.eq(20n);
      expect(await balanceOf(f, f.bob)).to.eq(1n);
    });

    it("should revert when confirmFunds flags are forged", async function () {
      const [hA, hB] = await f.game.getFundsHandles(id);
      const res = await fhevm.publicDecrypt([hA, hB]);
      await expect(f.game.confirmFunds(id, true, true, res.decryptionProof)).to.be.reverted;
    });

    it("should revert NotBetting when acting after the hand was voided", async function () {
      await confirm();
      await expect(act(f.alice, CHECK)).to.be.revertedWithCustomError(f.game, "NotBetting");
    });
  });
});

describe("IndianPokerGame HCU", function () {
  const MAX_TOTAL = 5_000_000;
  const MAX_DEPTH = 2_000_000;

  it("should keep the join transaction under 5M total and 2M depth HCU", async function () {
    if (!fhevm.isMock) this.skip();
    const f = await deployAll();
    await fund(f, f.alice);
    await fund(f, f.bob);
    await f.game.connect(f.alice).createTable(ANYONE);
    const rc = await (await f.game.connect(f.bob).joinTable(1n)).wait();
    const hcu = fhevm.computeTransactionHCU(rc!);
    console.log("      join HCU total/depth:", hcu.globalHCU, hcu.maxHCUDepth);
    expect(Number(hcu.globalHCU)).to.be.lt(MAX_TOTAL);
    expect(Number(hcu.maxHCUDepth)).to.be.lt(MAX_DEPTH);
  });

  it("should keep the showdown action and confirmFunds well inside the limits", async function () {
    if (!fhevm.isMock) this.skip();
    const f = await deployAll();
    await fund(f, f.alice);
    await fund(f, f.bob);
    await openAndJoin(f);
    await f.game.connect(f.alice).act(1n, CHECK);
    const actRc = await (await f.game.connect(f.bob).act(1n, CHECK)).wait();
    const actHcu = fhevm.computeTransactionHCU(actRc!);
    const [hA, hB] = await f.game.getFundsHandles(1n);
    const res = await fhevm.publicDecrypt([hA, hB]);
    const confirmRc = await (await f.game.confirmFunds(1n, true, true, res.decryptionProof)).wait();
    const confirmHcu = fhevm.computeTransactionHCU(confirmRc!);
    console.log("      showdown act HCU:", actHcu.globalHCU, actHcu.maxHCUDepth);
    console.log("      confirmFunds HCU:", confirmHcu.globalHCU, confirmHcu.maxHCUDepth);
    expect(Number(actHcu.globalHCU)).to.be.lt(MAX_TOTAL);
    expect(Number(confirmHcu.globalHCU)).to.be.lt(MAX_TOTAL);
  });
});
