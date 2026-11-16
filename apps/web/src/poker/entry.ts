import type { PokerClient } from "./client";

/** A table link either resumes a hand the player already sits at (after a reload) or takes a free seat. */
export async function resolveTableEntry(client: PokerClient, id: number): Promise<"resume" | "join"> {
  const view = await client.getTable(id);
  return view.mySeat ? "resume" : "join";
}
