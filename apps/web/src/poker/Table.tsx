import { useCallback } from "react";

import { Disclaimer, ErrorBox } from "@/components";

import type { PokerClient } from "./client";
import { legalActions } from "./rules";
import type { PokerAction, Seat, TableView } from "./types";
import { useTable } from "./useTable";

const LABEL: Record<PokerAction, string> = { check: "Check", bet: "Bet 1", call: "Call 1", fold: "Fold" };
const PAST: Record<PokerAction, string> = { check: "checked", bet: "bet 1", call: "called", fold: "folded" };

function Card({ value, caption }: { value: number | null; caption: string }) {
  return (
    <div className="p--seat">
      <div className={`p--card${value !== null ? " is--face" : ""}`} aria-label={value !== null ? `${caption}: ${value}` : `${caption}: hidden`}>
        <div className="p--cardInner">
          <div className="p--cardSide p--cardBack" />
          <div className="p--cardSide p--cardFront">{value ?? ""}</div>
        </div>
      </div>
      <span className="p--seatLabel">{caption}</span>
    </div>
  );
}

const seatOfIndex = (i: number): Seat => (i % 2 === 0 ? "A" : "B");

function outcomeOf(view: TableView): { won: boolean; net: number } | null {
  if (view.phase !== "settled" || !view.mySeat || !view.winner) return null;
  const mine = view.mySeat === "A" ? view.contribA : view.contribB;
  const theirs = view.mySeat === "A" ? view.contribB : view.contribA;
  const won = view.winner === view.mySeat;
  return { won, net: won ? theirs : -mine };
}

type Props = {
  client: PokerClient;
  id: number;
  account: string;
  onLeave: () => void;
  onRematch: () => void;
  onCancel: () => void;
  /** True when the opponent is the bot: the screen asks the bot API for each of its moves. */
  vsBot: boolean;
  /** Offered when the bot refuses the table. */
  onNormalTable: () => void;
};

export function TableScreen({ client, id, account, onLeave, onRematch, onCancel, vsBot, onNormalTable }: Props) {
  const botPing = client.botPing?.bind(client);
  const ping = useCallback((tableId: number) => botPing!(tableId), [botPing]);
  const t = useTable(client, id, account, vsBot && botPing ? ping : undefined);
  const view = t.view;
  if (!view) {
    return (
      <div className="p--body">
        <p className="p--sub">Loading table</p>
        <ErrorBox message={t.error} />
      </div>
    );
  }

  const myTurn = view.phase === "betting" && view.turn !== null && view.turn === view.mySeat;
  const legal = myTurn ? legalActions(view.history) : [];
  const pot = view.contribA + view.contribB;
  const outcome = outcomeOf(view);
  const isOver = view.phase === "settled" || view.phase === "voided" || view.phase === "cancelled";
  const canClaimTimeout = view.phase === "betting" && view.turn !== null && view.turn !== view.mySeat && t.secondsLeft === 0;
  const inviteUrl = `${window.location.origin}${window.location.pathname}?table=${id}`;

  return (
    <div className="p--body">
      <div className="p--row">
        <h2 className="p--h">Table {id}</h2>
        <span className="p--pot">Pot {pot}</span>
      </div>

      <div className="p--felt">
        <Card value={t.opponentCard} caption="Opponent's card" />
        <div className="p--turn" role="status">
          {view.phase === "open" && <span>Waiting for an opponent</span>}
          {view.phase === "betting" && (
            <>
              <span>{myTurn ? "Your turn" : "Opponent's turn"}</span>
              <span className={`p--timer${t.secondsLeft <= 10 ? " is--low" : ""}`}>{t.secondsLeft}s</span>
            </>
          )}
          {view.phase === "ended" && <span>Publishing the result</span>}
          {view.phase === "settled" && <span>Hand finished</span>}
        </div>
        <Card value={null} caption="Your card, hidden from you" />
      </div>

      {view.history.length > 0 && (
        <ul className="p--history" aria-label="Betting history">
          {view.history.map((action, i) => (
            <li key={`${i}-${action}`}>
              {seatOfIndex(i) === view.mySeat ? "You" : "Opponent"} {PAST[action]}
            </li>
          ))}
        </ul>
      )}

      {view.phase === "betting" && (
        <div className="p--stack">
          <div className="p--actions">
            {legalActions(view.history)
              .map((action) => (
                <button
                  key={action}
                  className={`c--btn${action === "fold" ? " is--secondary" : ""}`}
                  type="button"
                  disabled={!legal.includes(action)}
                  onClick={() => void t.act(action)}
                >
                  {LABEL[action]}
                </button>
              ))}
          </div>
          <div className="p--busy" aria-live="polite">
            {t.busy ?? ""}
          </div>
        </div>
      )}

      {canClaimTimeout && (
        <button className="c--btn" type="button" onClick={() => void t.claimTimeout()}>
          Claim the win, opponent timed out
        </button>
      )}

      {view.phase === "open" && (
        <div className="p--stack">
          {vsBot ? (
            <p className="p--sub">Waiting for the bot to sit down.</p>
          ) : (
            <>
              <p className="p--sub">Send this link to a friend, or wait for an opponent from the lobby.</p>
              <input className="p--link" readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
            </>
          )}
          <button className="c--btn is--secondary" type="button" onClick={onCancel}>
            Cancel table
          </button>
        </div>
      )}

      {outcome && (
        <div className="p--result" role="status">
          <strong>{outcome.won ? `You won ${outcome.net} RUSH` : `You lost ${-outcome.net} RUSH`}</strong>
          <p>
            {view.endKind === "showdown"
              ? "Only the winner was published on-chain. The cards stay private."
              : "The hand ended by fold. No card was revealed."}
          </p>
        </div>
      )}
      {view.phase === "voided" && (
        <div className="p--result" role="status">
          <strong>Hand void</strong>
          <p>A deposit was missing. Whatever was paid has been returned.</p>
        </div>
      )}

      {isOver && (
        <div className="p--actions">
          <button className="c--btn" type="button" onClick={onRematch}>
            Play again
          </button>
          <button className="c--btn is--secondary" type="button" onClick={onLeave}>
            Back to lobby
          </button>
        </div>
      )}
      <ErrorBox message={t.error} />
      {t.botProblem && (
        <button className="c--btn" type="button" onClick={onNormalTable}>
          Open a normal table
        </button>
      )}
      <Disclaimer />
    </div>
  );
}
