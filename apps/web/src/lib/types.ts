import { BaseError, ContractFunctionRevertedError } from "viem";

export type OnStep = (label: string) => void;

const FRIENDLY_ERRORS: Record<string, string> = {
  NotYourTurn: "It is not your turn",
  IllegalAction: "That move is not allowed now",
  TableFull: "That table is already full",
  NotOpen: "That table is no longer open",
  NotInvited: "That table is reserved for another player",
  SelfJoin: "You cannot join your own table",
  GameNotOperator: "Approve the game to use your chips first",
  DeadlineNotReached: "The opponent still has time to move",
  FundsNotConfirmed: "Deposits are still being confirmed",
};

/** Name of a decoded custom error. Only simulated (ABI-aware) calls produce one; viem walks the cause chain. */
export function revertErrorName(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null;
  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
  return reverted instanceof ContractFunctionRevertedError ? (reverted.data?.errorName ?? null) : null;
}

export function errorMessage(error: unknown): string {
  const name = revertErrorName(error);
  if (name && FRIENDLY_ERRORS[name]) return FRIENDLY_ERRORS[name];
  if (error instanceof Error) return error.message.split("\n")[0] ?? error.message;
  return String(error);
}
