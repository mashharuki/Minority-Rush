import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
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
