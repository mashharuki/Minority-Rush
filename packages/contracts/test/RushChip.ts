import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import type { RushChip } from "../types";

describe("RushChip owner mint", function () {
  let chip: RushChip;
  let chipAddr: string;

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    chip = (await (await ethers.getContractFactory("RushChip")).deploy()) as unknown as RushChip;
    chipAddr = await chip.getAddress();
  });

  it("should let the owner mint chips when called by the deployer", async function () {
    const [, alice] = await ethers.getSigners();
    await chip.mint(alice.address, 7);
    const handle = await chip.confidentialBalanceOf(alice.address);
    expect(await fhevm.userDecryptEuint(FhevmType.euint64, handle, chipAddr, alice)).to.eq(7n);
  });

  it("should revert when a non-owner calls mint", async function () {
    const [, alice] = await ethers.getSigners();
    await expect(chip.connect(alice).mint(alice.address, 7)).to.be.revertedWithCustomError(
      chip,
      "OwnableUnauthorizedAccount",
    );
  });
});
