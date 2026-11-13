import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import type { MinorityRushGame, RushChip } from "../types";

const DURATION = 60;
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

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    [, alice, bob, carol, mallory] = await ethers.getSigners();
    chip = (await (await ethers.getContractFactory("RushChip")).deploy()) as unknown as RushChip;
    chipAddr = await chip.getAddress();
    game = (await (await ethers.getContractFactory("MinorityRushGame")).deploy(
      chipAddr,
      DURATION,
    )) as unknown as MinorityRushGame;
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

  async function settle(roundId: number): Promise<boolean> {
    await time.increase(DURATION + 1);
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
    await expect(chip.connect(alice).faucet()).to.be.revertedWithCustomError(chip, "FaucetCoolingDown");
    // a third party cannot read alice's balance
    const handle = await chip.confidentialBalanceOf(alice.address);
    await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, chipAddr, mallory)).to.be.rejected;
  });

  it("pays 2x to the minority side and 0 to the majority", async function () {
    for (const p of [alice, bob, carol]) await fund(p);
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
    for (const p of [alice, bob]) await fund(p);
    await game.startRound();
    await enter(1, alice, MOON, 7);
    await enter(1, bob, SUN, 4);

    const [, , choice, stake] = await game.getEntry(1, alice.address);
    expect(await fhevm.userDecryptEuint(FhevmType.euint8, choice, gameAddr, alice)).to.eq(1n);
    expect(await fhevm.userDecryptEuint(FhevmType.euint64, stake, gameAddr, alice)).to.eq(7n);
    await expect(fhevm.userDecryptEuint(FhevmType.euint64, stake, gameAddr, bob)).to.be.rejected;
  });

  it("breaks a tie with on-chain randomness (exactly one side wins)", async function () {
    for (const p of [alice, bob]) await fund(p);
    await game.startRound();
    await enter(1, alice, SUN, 3);
    await enter(1, bob, MOON, 3);
    const moonWon = await settle(1);
    await game.connect(alice).claim(1);
    await game.connect(bob).claim(1);
    const [a, b] = [await balanceOf(alice), await balanceOf(bob)];
    expect(moonWon ? [a, b] : [b, a]).to.deep.eq([17n, 23n]); // loser 20-3, winner 20-3+6
  });

  it("clamps stakes to the allowed range", async function () {
    for (const p of [alice, bob]) await fund(p);
    await game.startRound();
    await enter(1, alice, SUN, 500); // clamped to 10
    await enter(1, bob, MOON, 0); // clamped to 1
    expect(await balanceOf(alice)).to.eq(10n);
    expect(await balanceOf(bob)).to.eq(19n);
  });

  it("stakes 0 (no revert) when the balance is too small", async function () {
    await fund(alice);
    await fund(bob);
    // two rounds of max stake without claiming drain alice's 20 chips
    for (const roundId of [1, 2]) {
      await game.startRound();
      await enter(roundId, alice, SUN, 10);
      await enter(roundId, bob, MOON, 1);
      await settle(roundId);
    }
    expect(await balanceOf(alice)).to.eq(0n);
    await game.startRound();
    await enter(3, alice, SUN, 10);
    const [, , , stake] = await game.getEntry(3, alice.address);
    expect(await fhevm.userDecryptEuint(FhevmType.euint64, stake, gameAddr, alice)).to.eq(0n);
  });

  it("refunds stakes when fewer than two players join", async function () {
    await fund(alice);
    await game.startRound();
    await enter(1, alice, SUN, 6);
    await time.increase(DURATION + 1);
    await game.closeRound(1);
    await game.connect(alice).claim(1);
    expect(await balanceOf(alice)).to.eq(20n);
  });

  describe("guards", function () {
    beforeEach(async function () {
      for (const p of [alice, bob]) await fund(p);
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
      await time.increase(DURATION + 1);
      await expect(enter(1, alice, SUN, 2)).to.be.revertedWithCustomError(game, "RoundNotOpen");
    });

    it("rejects a new round while one is active", async function () {
      await expect(game.startRound()).to.be.revertedWithCustomError(game, "RoundStillActive");
    });

    it("rejects claiming before settlement, double claims and non-players", async function () {
      await enter(1, alice, SUN, 2);
      await enter(1, bob, MOON, 2);
      await expect(game.connect(alice).claim(1)).to.be.revertedWithCustomError(game, "RoundNotClaimable");
      await settle(1);
      await expect(game.connect(mallory).claim(1)).to.be.revertedWithCustomError(game, "NotEntered");
      await game.connect(alice).claim(1);
      await expect(game.connect(alice).claim(1)).to.be.revertedWithCustomError(game, "AlreadyClaimed");
    });

    it("rejects a forged winner or proof in finalizeRound", async function () {
      await enter(1, alice, SUN, 2);
      await enter(1, bob, MOON, 2);
      await time.increase(DURATION + 1);
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

    it("caps the room at 8 players", async function () {
      const signers = await ethers.getSigners();
      for (let i = 1; i <= 8; i++) {
        await chip.connect(signers[i]).faucet().catch(() => undefined);
        await chip.connect(signers[i]).setOperator(gameAddr, FAR_FUTURE);
        await enter(1, signers[i], i % 2, 1);
      }
      await chip.connect(signers[9]).faucet();
      await chip.connect(signers[9]).setOperator(gameAddr, FAR_FUTURE);
      await expect(enter(1, signers[9], SUN, 1)).to.be.revertedWithCustomError(game, "RoundFull");
    });
  });
  describe("observer (smart-account owner EOA)", function () {
    it("lets the registered observer decrypt balance, choice, stake and reward, and nobody else", async function () {
      // alice stands in for a smart account, carol for its owner EOA
      await fund(alice);
      await fund(bob);
      await chip.connect(alice).setObserver(alice.address, carol.address);
      expect(await chip.observer(alice.address)).to.eq(carol.address);

      const balanceHandle = await chip.confidentialBalanceOf(alice.address);
      expect(await fhevm.userDecryptEuint(FhevmType.euint64, balanceHandle, chipAddr, carol)).to.eq(20n);

      await game.startRound();
      await enter(1, alice, SUN, 5);
      await enter(1, bob, MOON, 2);
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
