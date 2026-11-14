import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import type { MinorityRushGame, RushChip } from "../types";

const DEADLINES = [10800, 32400, 43200, 50400];
const WINDOW = 5400;
const DAY = 86400;
const SUN = 0;
const MOON = 1;
const FAR_FUTURE = 2n ** 40n;

describe("MinorityRushGame", function () {
  let chip: RushChip;
  let game: MinorityRushGame;
  let chipAddr: string;
  let gameAddr: string;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let carol: HardhatEthersSigner;
  let mallory: HardhatEthersSigner;
  let dave: HardhatEthersSigner;

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    [, alice, bob, carol, mallory, dave] = await ethers.getSigners();
    chip = (await (await ethers.getContractFactory("RushChip")).deploy()) as unknown as RushChip;
    chipAddr = await chip.getAddress();
    game = (await (
      await ethers.getContractFactory("MinorityRushGame")
    ).deploy(chipAddr, DEADLINES, WINDOW, 3, 100)) as unknown as MinorityRushGame;
    gameAddr = await game.getAddress();
  });

  async function fund(player: HardhatEthersSigner, approve = true) {
    await chip.connect(player).faucet();
    if (approve) await chip.connect(player).setOperator(gameAddr, FAR_FUTURE);
  }

  async function enter(roundId: number, player: HardhatEthersSigner, side: number, stake: number) {
    const input = fhevm.createEncryptedInput(gameAddr, player.address);
    input.add8(side).add64(stake);
    const enc = await input.encrypt();
    return game.connect(player).enter(roundId, enc.handles[0], enc.handles[1], enc.inputProof);
  }

  async function balanceOf(player: HardhatEthersSigner): Promise<bigint> {
    const handle = await chip.confidentialBalanceOf(player.address);
    return fhevm.userDecryptEuint(FhevmType.euint64, handle, chipAddr, player);
  }

  async function advanceTo(target: bigint | number) {
    if ((await time.latest()) < Number(target)) await time.increaseTo(target);
  }

  /** Moves the chain into the open window before the next deadline and returns that deadline. */
  async function openWindow(): Promise<bigint> {
    const end = await game.nextDeadline(await time.latest());
    await advanceTo(end - BigInt(WINDOW));
    return end;
  }

  async function settle(roundId: number): Promise<boolean> {
    const [, endTime] = await game.getRound(roundId);
    await advanceTo(endTime);
    await game.closeRound(roundId);
    const [, , , , , handle] = await game.getRound(roundId);
    const res = await fhevm.publicDecrypt([handle]);
    const [moonWon] = ethers.AbiCoder.defaultAbiCoder().decode(["bool"], res.abiEncodedClearValues);
    await game.finalizeRound(roundId, moonWon, res.decryptionProof);
    return moonWon as boolean;
  }

  it("faucet mints 20 private chips and rate-limits", async function () {
    await fund(alice, false);
    expect(await balanceOf(alice)).to.eq(20n);
    await time.increase(24 * 3600 - 60);
    await expect(chip.connect(alice).faucet()).to.be.revertedWithCustomError(chip, "FaucetCoolingDown");
    await time.increase(120);
    await chip.connect(alice).faucet();
    // a third party cannot read alice's balance
    const handle = await chip.confidentialBalanceOf(alice.address);
    await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, chipAddr, mallory)).to.be.rejected;
  });

  it("pays 2x to the minority side and 0 to the majority", async function () {
    for (const p of [alice, bob, carol]) await fund(p);
    await openWindow();
    await game.startRound();
    await enter(1, alice, SUN, 5);
    await enter(1, bob, SUN, 3);
    await enter(1, carol, MOON, 2);

    const moonWon = await settle(1);
    expect(moonWon).to.eq(true);

    for (const p of [alice, bob, carol]) await game.connect(p).claim(1);
    expect(await balanceOf(alice)).to.eq(15n);
    expect(await balanceOf(bob)).to.eq(17n);
    expect(await balanceOf(carol)).to.eq(22n);
  });

  it("keeps choice and stake private to the player", async function () {
    for (const p of [alice, bob, carol]) await fund(p);
    await openWindow();
    await game.startRound();
    await enter(1, alice, MOON, 7);
    await enter(1, bob, SUN, 4);
    await enter(1, carol, SUN, 1);

    const [, , choice, stake] = await game.getEntry(1, alice.address);
    expect(await fhevm.userDecryptEuint(FhevmType.euint8, choice, gameAddr, alice)).to.eq(1n);
    expect(await fhevm.userDecryptEuint(FhevmType.euint64, stake, gameAddr, alice)).to.eq(7n);
    await expect(fhevm.userDecryptEuint(FhevmType.euint64, stake, gameAddr, bob)).to.be.rejected;
  });

  it("breaks a tie with on-chain randomness (exactly one side wins)", async function () {
    for (const p of [alice, bob, carol]) await fund(p);
    await openWindow();
    await game.startRound();
    await enter(1, alice, SUN, 3);
    await enter(1, bob, MOON, 2);
    await enter(1, carol, MOON, 1);
    const moonWon = await settle(1);
    for (const p of [alice, bob, carol]) await game.connect(p).claim(1);
    const [a, b, c] = [await balanceOf(alice), await balanceOf(bob), await balanceOf(carol)];
    // SUN pool == MOON pool == 3; the winning side is paid 2x its stake
    expect([a, b, c]).to.deep.eq(moonWon ? [17n, 22n, 21n] : [23n, 18n, 19n]);
  });

  it("clamps stakes to the allowed range", async function () {
    for (const p of [alice, bob]) await fund(p);
    await openWindow();
    await game.startRound();
    await enter(1, alice, SUN, 500); // clamped to 10
    await enter(1, bob, MOON, 0); // clamped to 1
    expect(await balanceOf(alice)).to.eq(10n);
    expect(await balanceOf(bob)).to.eq(19n);
  });

  it("stakes 0 (no revert) when the balance is too small", async function () {
    for (const p of [alice, bob, carol]) await fund(p);
    // two rounds of max stake without claiming drain alice's 20 chips
    for (const roundId of [1, 2]) {
      await openWindow();
      await game.startRound();
      await enter(roundId, alice, SUN, 10);
      await enter(roundId, bob, MOON, 1);
      await enter(roundId, carol, MOON, 1);
      await settle(roundId);
    }
    expect(await balanceOf(alice)).to.eq(0n);
    await openWindow();
    await game.startRound();
    await enter(3, alice, SUN, 10);
    const [, , , stake] = await game.getEntry(3, alice.address);
    expect(await fhevm.userDecryptEuint(FhevmType.euint64, stake, gameAddr, alice)).to.eq(0n);
  });

  describe("scheduled rounds", function () {
    it("opens a round that ends at the next deadline", async function () {
      const end = await openWindow();
      await game.startRound();
      const [, endTime] = await game.getRound(1);
      expect(endTime).to.eq(end);
    });

    it("rejects startRound outside the window", async function () {
      // use the deadline after next so the target time is always in the future
      const end = await game.nextDeadline(await game.nextDeadline(await time.latest()));
      await time.increaseTo(end - BigInt(WINDOW) - 60n);
      await expect(game.startRound()).to.be.revertedWithCustomError(game, "OutsideWindow");
    });

    it("rejects startRound while a round is open", async function () {
      await openWindow();
      await game.startRound();
      await expect(game.startRound()).to.be.revertedWithCustomError(game, "RoundStillActive");
    });

    it("a closing round does not block the next window", async function () {
      for (const p of [alice, bob, carol]) await fund(p);
      await openWindow();
      await game.startRound();
      await enter(1, alice, SUN, 2);
      await enter(1, bob, MOON, 2);
      await enter(1, carol, MOON, 2);
      const [, endTime] = await game.getRound(1);
      await time.increaseTo(endTime);
      await game.closeRound(1);
      expect((await game.getRound(1))[2]).to.eq(2n); // Closing

      await openWindow();
      expect(await game.startRound.staticCall()).to.eq(2n);
      await game.startRound();
      expect(await game.latestRoundId()).to.eq(2n);
    });

    it("finalizes and pays an older closing round after the next round started", async function () {
      for (const p of [alice, bob, carol]) await fund(p);
      await openWindow();
      await game.startRound();
      await enter(1, alice, SUN, 5);
      await enter(1, bob, SUN, 3);
      await enter(1, carol, MOON, 2);
      const [, endTime] = await game.getRound(1);
      await advanceTo(endTime);
      await game.closeRound(1);

      await openWindow();
      await game.startRound();
      expect(await game.latestRoundId()).to.eq(2n);

      const [, , , , , handle] = await game.getRound(1);
      const res = await fhevm.publicDecrypt([handle]);
      const [moonWon] = ethers.AbiCoder.defaultAbiCoder().decode(["bool"], res.abiEncodedClearValues);
      await game.finalizeRound(1, moonWon, res.decryptionProof);
      expect(moonWon).to.eq(true);
      expect((await game.getRound(1))[2]).to.eq(3n); // Settled
      expect((await game.getRound(2))[2]).to.eq(1n); // Open

      for (const p of [alice, bob, carol]) await game.connect(p).claim(1);
      expect(await balanceOf(alice)).to.eq(15n);
      expect(await balanceOf(bob)).to.eq(17n);
      expect(await balanceOf(carol)).to.eq(22n);
    });

    it("an open round past its deadline blocks the next window until it is closed", async function () {
      await openWindow();
      await game.startRound();
      const [, endTime] = await game.getRound(1);
      await advanceTo(endTime);

      await openWindow();
      await expect(game.startRound()).to.be.revertedWithCustomError(game, "RoundStillActive");
      await game.closeRound(1);
      await game.startRound();
      expect(await game.latestRoundId()).to.eq(2n);
    });

    it("opens the window exactly windowSeconds before the deadline", async function () {
      // use the deadline after next so both target times are in the future
      const end = await game.nextDeadline(await game.nextDeadline(await time.latest()));
      const opens = end - BigInt(WINDOW);
      await time.setNextBlockTimestamp(opens - 1n);
      await expect(game.startRound()).to.be.revertedWithCustomError(game, "OutsideWindow");

      await time.setNextBlockTimestamp(opens);
      await game.startRound();
      const [, endTime] = await game.getRound(1);
      expect(endTime).to.eq(end);
      expect(await time.latest()).to.eq(Number(opens));
    });

    it("nextDeadline is strictly after the given time", async function () {
      const day0 = (Math.floor((await time.latest()) / DAY) + 1) * DAY;
      const first = BigInt(day0 + DEADLINES[0]);
      expect(await game.nextDeadline(first)).to.eq(BigInt(day0 + DEADLINES[1]));
      expect(await game.nextDeadline(first - 1n)).to.eq(first);
    });

    it("nextDeadline wraps past the last deadline of the day", async function () {
      const day0 = Math.floor((await time.latest()) / DAY) * DAY;
      expect(await game.nextDeadline(day0 + DEADLINES[3])).to.eq(BigInt(day0 + DAY + DEADLINES[0]));
    });

    it("cancels and refunds with fewer than 3 players", async function () {
      for (const p of [alice, bob]) await fund(p);
      await openWindow();
      await game.startRound();
      await enter(1, alice, SUN, 6);
      await enter(1, bob, MOON, 4);
      const [, endTime] = await game.getRound(1);
      await time.increaseTo(endTime);
      await game.closeRound(1);
      expect((await game.getRound(1))[2]).to.eq(4n); // Cancelled
      await game.connect(alice).claim(1);
      await game.connect(bob).claim(1);
      expect(await balanceOf(alice)).to.eq(20n);
      expect(await balanceOf(bob)).to.eq(20n);
    });

    it("caps the room at maxPlayers", async function () {
      const small = (await (
        await ethers.getContractFactory("MinorityRushGame")
      ).deploy(chipAddr, DEADLINES, WINDOW, 3, 3)) as unknown as MinorityRushGame;
      game = small;
      gameAddr = await small.getAddress();
      for (const p of [alice, bob, carol, mallory]) await fund(p);
      await openWindow();
      await game.startRound();
      for (const p of [alice, bob, carol]) await enter(1, p, SUN, 1);
      await expect(enter(1, mallory, SUN, 1)).to.be.revertedWithCustomError(game, "RoundFull");
    });

    it("rejects a bad schedule", async function () {
      const factory = await ethers.getContractFactory("MinorityRushGame");
      const bad: [string, number[], number, number, number][] = [
        ["empty", [], WINDOW, 3, 100],
        ["unsorted", [43200, 10800], WINDOW, 3, 100],
        ["window too large", DEADLINES, 12000, 3, 100],
        ["minPlayers 1", DEADLINES, WINDOW, 1, 100],
        ["max below min", DEADLINES, WINDOW, 5, 4],
      ];
      for (const [, deadlines, window, min, max] of bad) {
        await expect(factory.deploy(chipAddr, deadlines, window, min, max)).to.be.revertedWithCustomError(
          game,
          "BadSchedule",
        );
      }
    });
  });

  describe("guards", function () {
    beforeEach(async function () {
      for (const p of [alice, bob, carol]) await fund(p);
      await openWindow();
      await game.startRound();
    });

    it("rejects double entry", async function () {
      await enter(1, alice, SUN, 2);
      await expect(enter(1, alice, MOON, 2)).to.be.revertedWithCustomError(game, "AlreadyEntered");
    });

    it("rejects entry without operator approval", async function () {
      await chip.connect(mallory).faucet();
      await expect(enter(1, mallory, SUN, 2)).to.be.revertedWithCustomError(game, "GameNotOperator");
    });

    it("rejects entry after the deadline and closing before it", async function () {
      await expect(game.closeRound(1)).to.be.revertedWithCustomError(game, "RoundNotFinished");
      const [, endTime] = await game.getRound(1);
      await time.increaseTo(endTime);
      await expect(enter(1, alice, SUN, 2)).to.be.revertedWithCustomError(game, "RoundNotOpen");
    });

    it("rejects claiming before settlement, double claims and non-players", async function () {
      await enter(1, alice, SUN, 2);
      await enter(1, bob, MOON, 2);
      await enter(1, carol, MOON, 1);
      await expect(game.connect(alice).claim(1)).to.be.revertedWithCustomError(game, "RoundNotClaimable");
      await settle(1);
      await expect(game.connect(mallory).claim(1)).to.be.revertedWithCustomError(game, "NotEntered");
      await game.connect(alice).claim(1);
      await expect(game.connect(alice).claim(1)).to.be.revertedWithCustomError(game, "AlreadyClaimed");
    });

    it("rejects a forged winner or proof in finalizeRound", async function () {
      await enter(1, alice, SUN, 2);
      await enter(1, bob, MOON, 2);
      await enter(1, carol, MOON, 1);
      const [, endTime] = await game.getRound(1);
      await time.increaseTo(endTime);
      await game.closeRound(1);
      const [, , , , , handle] = await game.getRound(1);
      const res = await fhevm.publicDecrypt([handle]);
      const [moonWon] = ethers.AbiCoder.defaultAbiCoder().decode(["bool"], res.abiEncodedClearValues);
      await expect(game.finalizeRound(1, !moonWon, res.decryptionProof)).to.be.reverted;
      await expect(game.finalizeRound(1, moonWon, "0x")).to.be.reverted;
      await game.finalizeRound(1, moonWon, res.decryptionProof);
      await expect(game.finalizeRound(1, moonWon, res.decryptionProof)).to.be.revertedWithCustomError(
        game,
        "RoundNotClosing",
      );
    });
  });
  describe("observer (smart-account owner EOA)", function () {
    it("lets the registered observer decrypt balance, choice, stake and reward, and nobody else", async function () {
      // alice stands in for a smart account, carol for its owner EOA
      for (const p of [alice, bob, dave]) await fund(p);
      await chip.connect(alice).setObserver(alice.address, carol.address);
      expect(await chip.observer(alice.address)).to.eq(carol.address);

      const balanceHandle = await chip.confidentialBalanceOf(alice.address);
      expect(await fhevm.userDecryptEuint(FhevmType.euint64, balanceHandle, chipAddr, carol)).to.eq(20n);

      await openWindow();
      await game.startRound();
      await enter(1, alice, SUN, 5);
      await enter(1, bob, MOON, 2);
      await enter(1, dave, MOON, 1);
      const [, , choice, stake] = await game.getEntry(1, alice.address);
      expect(await fhevm.userDecryptEuint(FhevmType.euint8, choice, gameAddr, carol)).to.eq(0n);
      expect(await fhevm.userDecryptEuint(FhevmType.euint64, stake, gameAddr, carol)).to.eq(5n);
      await expect(fhevm.userDecryptEuint(FhevmType.euint64, stake, gameAddr, mallory)).to.be.rejected;

      await settle(1);
      await game.connect(alice).claim(1);
      const [, , , , reward] = await game.getEntry(1, alice.address);
      expect(await fhevm.userDecryptEuint(FhevmType.euint64, reward, gameAddr, carol)).to.eq(0n); // SUN lost
      const after = await chip.confidentialBalanceOf(alice.address);
      expect(await fhevm.userDecryptEuint(FhevmType.euint64, after, chipAddr, carol)).to.eq(15n);
    });

    it("only the account itself can set its observer", async function () {
      await expect(chip.connect(mallory).setObserver(alice.address, mallory.address)).to.be.revertedWithCustomError(
        chip,
        "Unauthorized",
      );
    });
  });
});
