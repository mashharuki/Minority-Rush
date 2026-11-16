import type { TableSnapshot } from "./handler";

/** How long after a missed deadline a table still counts as the bot's (the human may be slow to reload). */
export const ABANDONED_AFTER_SEC = 60;

/**
 * A table the bot is currently playing. A hand the human walked away from stops being active once its turn deadline
 * is long past, so it cannot keep the bot "busy" forever; the human (or anyone) can still claim the timeout.
 */
export function isActiveBotTable(table: TableSnapshot, botAddress: string): boolean {
  if (table.phase !== "betting" || !table.b) return false;
  if (table.b.toLowerCase() !== botAddress.toLowerCase()) return false;
  return table.turnDeadlineSec === 0 || table.nowSec <= table.turnDeadlineSec + ABANDONED_AFTER_SEC;
}
