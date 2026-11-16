import { describe, expect, it } from "vitest";

import { createDemoPokerClient } from "./demoPokerClient";
import { legalActions } from "./rules";

const noop = (): void => undefined;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("createDemoPokerClient", () => {
  it("should play a full hand against the built-in bot when running offline", async () => {
    const client = createDemoPokerClient({ botDelayMs: 0 });
    await client.connect();
    await client.onboard(noop);
    const before = await client.readBalance();
    const id = await client.createTable(null, noop);
    await sleep(5);
    expect((await client.getTable(id)).phase).toBe("betting");

    for (let i = 0; i < 6; i++) {
      const view = await client.getTable(id);
      if (view.phase !== "betting") break;
      if (view.turn === view.mySeat) await client.act(id, legalActions(view.history)[0] ?? "check", noop);
      await sleep(5);
    }
    const end = await client.getTable(id);
    expect(end.phase).toBe("settled");
    expect(end.winner).not.toBeNull();
    const after = await client.readBalance();
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
  });

  it("should reveal the same opponent card every time when asked repeatedly", async () => {
    const client = createDemoPokerClient({ botDelayMs: 0 });
    await client.connect();
    await client.onboard(noop);
    const id = await client.createTable(null, noop);
    await sleep(5);
    const first = await client.revealOpponentCard(id);
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThanOrEqual(13);
    expect(await client.revealOpponentCard(id)).toBe(first);
  });

  it("should return an empty open list when no table is open", async () => {
    const client = createDemoPokerClient({ botDelayMs: 0 });
    await client.connect();
    expect(await client.listOpenTables()).toEqual([]);
  });
});
