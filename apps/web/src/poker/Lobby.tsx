import { Disclaimer, ErrorBox } from "@/components";

type Props = {
  balance: number | null;
  openTables: number[];
  isBusy: boolean;
  error: string | null;
  canPlayBot: boolean;
  onShowBalance: () => void;
  onPlayBot: () => void;
  onCreate: () => void;
  onJoin: (id: number) => void;
};

export function LobbyScreen({ balance, openTables, isBusy, error, canPlayBot, onShowBalance, onPlayBot, onCreate, onJoin }: Props) {
  return (
    <div className="p--body">
      <div className="p--row">
        <div>
          <h2 className="p--h">Lobby</h2>
          <p className="p--sub">Each hand costs 2 RUSH up front. Unused chips come back.</p>
        </div>
        {balance === null ? (
          <button className="c--btn is--secondary p--small" type="button" onClick={onShowBalance} disabled={isBusy}>
            Show balance
          </button>
        ) : (
          <span className="p--pot">{balance} RUSH</span>
        )}
      </div>

      <div className="p--stack">
        {canPlayBot && (
          <button className="c--btn" type="button" onClick={onPlayBot} disabled={isBusy}>
            Play the bot
          </button>
        )}
        <button className={`c--btn${canPlayBot ? " is--secondary" : ""}`} type="button" onClick={onCreate} disabled={isBusy}>
          Create table
        </button>
      </div>

      <div className="p--stack">
        <h3 className="p--h p--h3">Open tables</h3>
        {openTables.length === 0 ? (
          <p className="p--sub">No open tables.</p>
        ) : (
          <ul className="p--tableList">
            {openTables.map((id) => (
              <li className="p--tableItem" key={id}>
                <span>Table {id}</span>
                <button className="c--btn" type="button" onClick={() => onJoin(id)} disabled={isBusy}>
                  Join
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ErrorBox message={error} />
      <Disclaimer />
    </div>
  );
}
