import { useCallback, useEffect, useMemo, useState } from "react";

import { AppBar, Disclaimer, ErrorBox, OfflineBanner, StatusBar, UpdateBanner } from "@/components";
import { isAaEnabled } from "@/lib/env";
import { usePwa } from "@/lib/pwa";
import { errorMessage } from "@/lib/types";

import { createPokerClient, type LoginKind } from "./index";
import { LobbyScreen } from "./Lobby";
import { TableScreen } from "./Table";

type Screen = "login" | "setup" | "lobby" | "table";
const LOBBY_POLL_MS = 4000;
export const APP_NAME = "Blind Bluff";

const inviteTable = (): number | null => {
  const raw = new URLSearchParams(window.location.search).get("table");
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export default function PokerApp() {
  const clients = useMemo(() => ({ email: createPokerClient("email"), wallet: createPokerClient("wallet") }), []);
  const [kind, setKind] = useState<LoginKind>(isAaEnabled ? "email" : "wallet");
  const client = clients[kind];
  const pwa = usePwa();
  const [screen, setScreen] = useState<Screen>("login");
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [openTables, setOpenTables] = useState<number[]>([]);
  const [tableId, setTableId] = useState<number | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const run = useCallback(async (work: () => Promise<void>): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      console.error("action failed", errorMessage(e));
      setError(errorMessage(e));
    } finally {
      setIsBusy(false);
      setStep(null);
    }
  }, []);

  const connect = (next: LoginKind) =>
    run(async () => {
      setKind(next);
      const chosen = clients[next];
      setAddress(await chosen.connect());
      // No separate onboarding transaction: faucet, operator approval and observer ride along with the first
      // createTable / joinTable as ONE user operation (see livePokerClient).
      setScreen("setup");
      const invited = inviteTable();
      if (invited !== null) {
        setStep("Taking your seat");
        await chosen.joinTable(invited, setStep);
        window.history.replaceState(null, "", window.location.pathname);
        setTableId(invited);
        setScreen("table");
        return;
      }
      setScreen("lobby");
    });

  const refreshLobby = useCallback(async () => {
    try {
      setOpenTables(await client.listOpenTables());
    } catch (e) {
      console.error("refresh lobby failed", errorMessage(e));
    }
  }, [client]);

  useEffect(() => {
    if (screen !== "lobby") return;
    void refreshLobby();
    const timer = setInterval(() => void refreshLobby(), LOBBY_POLL_MS);
    return () => clearInterval(timer);
  }, [screen, refreshLobby]);

  const create = () =>
    run(async () => {
      setStep("Opening a table");
      const id = await client.createTable(null, setStep);
      setTableId(id);
      setScreen("table");
    });

  const join = (id: number) =>
    run(async () => {
      setStep("Taking your seat");
      await client.joinTable(id, setStep);
      setTableId(id);
      setScreen("table");
    });

  const showBalance = () =>
    run(async () => {
      setStep("Decrypting your balance");
      setBalance(await client.readBalance());
    });

  const leave = () => {
    setTableId(null);
    setBalance(null);
    setScreen("lobby");
  };

  const cancel = () =>
    run(async () => {
      if (tableId !== null) await client.cancelTable(tableId, setStep);
      leave();
    });

  const shortAddress = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  return (
    <main className="c--canvas">
      <section className="c--phoneStage" aria-label={APP_NAME}>
        <div className="c--phone">
          <OfflineBanner isOffline={pwa.isOffline} />
          <UpdateBanner hasUpdate={pwa.hasUpdate && !pwa.isOffline} isLocked={isBusy} onUpdate={() => void pwa.applyUpdate()} />
          <section className="c--screen is--active">
            <StatusBar />
            <AppBar right={<span className="c--barNote">{address ? shortAddress : client.mode === "demo" ? "Demo mode" : "Sepolia"}</span>} />

            {screen === "login" && (
              <div className="p--body">
                <div>
                  <h2 className="p--h">{APP_NAME}</h2>
                  <p className="p--sub">
                    Heads-up poker where your card is shown to your opponent and hidden from you. Read their bets, not your hand.
                  </p>
                </div>
                <div className="p--stack">
                  <button className="c--btn" type="button" onClick={() => void connect(isAaEnabled ? "email" : "wallet")} disabled={isBusy}>
                    {client.mode === "demo" ? "Play the demo" : isAaEnabled ? "Play with email" : "Connect wallet"}
                  </button>
                  {isAaEnabled && (
                    <button className="c--btn is--secondary" type="button" onClick={() => void connect("wallet")} disabled={isBusy}>
                      Use a wallet instead
                    </button>
                  )}
                  <p className="p--sub">
                    {client.mode === "demo"
                      ? "Offline simulation. Nothing is encrypted in demo mode."
                      : isAaEnabled
                        ? "Private wallet by Privy. Gas is sponsored."
                        : "Sepolia testnet. Cards are encrypted on-chain."}
                  </p>
                </div>
                <ErrorBox message={error} />
                <Disclaimer />
              </div>
            )}

            {screen === "setup" && (
              <div className="p--body">
                <h2 className="p--h">Getting your player ready</h2>
                <p className="p--sub" role="status">
                  {step ?? "Almost there"}
                </p>
                <ErrorBox message={error} />
                {error && (
                  <button className="c--btn" type="button" onClick={() => void connect(kind)} disabled={isBusy}>
                    Try again
                  </button>
                )}
              </div>
            )}

            {screen === "lobby" && (
              <LobbyScreen
                balance={balance}
                openTables={openTables}
                isBusy={isBusy}
                error={error}
                canPlayBot={client.mode === "demo"}
                onShowBalance={() => void showBalance()}
                onPlayBot={() => void create()}
                onCreate={() => void create()}
                onJoin={(id) => void join(id)}
              />
            )}

            {screen === "table" && tableId !== null && address !== null && (
              <TableScreen
                client={client}
                id={tableId}
                account={address}
                onLeave={leave}
                onRematch={() => void create()}
                onCancel={() => void cancel()}
              />
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
