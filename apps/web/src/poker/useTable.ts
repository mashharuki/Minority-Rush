import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { PokerClient } from "./client";
import { createTableController, type TableState } from "./tableController";
import type { PokerAction } from "./types";

export type UseTable = TableState & {
  secondsLeft: number;
  act: (action: PokerAction) => Promise<void>;
  claimTimeout: () => Promise<void>;
};

/** Follows one table. Everything decrypted or optimistic is dropped when the table or the account changes. */
export function useTable(client: PokerClient, id: number | null, account: string | null): UseTable {
  const controller = useMemo(() => createTableController(client), [client]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (id === null || account === null) return;
    void controller.start(id, account);
    return () => controller.stop();
  }, [controller, id, account]);

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(timer);
  }, []);

  return { ...state, secondsLeft: controller.secondsLeft(), act: controller.act, claimTimeout: controller.claimTimeout };
}
