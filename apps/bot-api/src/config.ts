import { z } from "zod";

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 20-byte hex address");

const envSchema = z.object({
  /** The bot's private key. Testnet play-money only; lives in the server environment, never in the browser. */
  BOT_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  POKER_ADDRESS: addressSchema,
  CHIP_ADDRESS: addressSchema,
  RPC_URL: z.string().min(1).default("https://ethereum-sepolia-rpc.publicnode.com"),
  PRIVY_APP_ID: z.string().min(1),
  /** Public verification key (PEM) or JWKS URL from the Privy dashboard. Not a secret. */
  PRIVY_VERIFICATION_KEY: z.string().min(1),
  ALLOWED_WEB_ORIGIN: z.string().min(1),
  BOT_MAX_TABLES: z.coerce.number().int().positive().default(5),
  /** Below this ETH balance (wei) or chip balance the bot stops taking new tables. */
  BOT_MIN_ETH_WEI: z.coerce.bigint().default(10_000_000_000_000_000n),
  BOT_MIN_CHIPS: z.coerce.number().int().nonnegative().default(4),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),
});

export type BotConfig = {
  botPrivateKey: `0x${string}`;
  poker: `0x${string}`;
  chip: `0x${string}`;
  rpcUrl: string;
  privyAppId: string;
  privyVerificationKey: string;
  allowedOrigins: string[];
  maxTables: number;
  minEthWei: bigint;
  minChips: number;
  rateLimitPerMinute: number;
};

export type ConfigResult = { ok: true; data: BotConfig } | { ok: false; error: string };

/** Validates environment variables once at the boundary. Never echoes values back (the key is a secret). */
export function loadConfig(env: Record<string, string | undefined>): ConfigResult {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    return { ok: false, error: `Invalid bot-api configuration: ${fields}` };
  }
  const v = parsed.data;
  return {
    ok: true,
    data: {
      botPrivateKey: v.BOT_PRIVATE_KEY as `0x${string}`,
      poker: v.POKER_ADDRESS as `0x${string}`,
      chip: v.CHIP_ADDRESS as `0x${string}`,
      rpcUrl: v.RPC_URL,
      privyAppId: v.PRIVY_APP_ID,
      privyVerificationKey: v.PRIVY_VERIFICATION_KEY.replace(/\\n/g, "\n").trim(),
      allowedOrigins: v.ALLOWED_WEB_ORIGIN.split(",")
        .map((o) => o.trim().replace(/\/+$/, ""))
        .filter(Boolean),
      maxTables: v.BOT_MAX_TABLES,
      minEthWei: v.BOT_MIN_ETH_WEI,
      minChips: v.BOT_MIN_CHIPS,
      rateLimitPerMinute: v.RATE_LIMIT_PER_MINUTE,
    },
  };
}
