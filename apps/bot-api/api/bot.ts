import type { IncomingMessage, ServerResponse } from "node:http";

import { verifyAccessToken } from "@privy-io/node";
import { verifyMessage } from "viem";

// Explicit .js extensions: Vercel runs this package as native ESM (package.json "type": "module").
import { createBotRuntime } from "../src/chain.js";
import { loadConfig } from "../src/config.js";
import { handleBotRequest } from "../src/handler.js";
import { createRateLimiter } from "../src/rateLimit.js";

const configResult = loadConfig(process.env);
const runtime = configResult.ok ? createBotRuntime(configResult.data) : null;
const limiter = configResult.ok ? createRateLimiter(configResult.data.rateLimitPerMinute) : null;

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : null;
}

/** Vercel Node function: advances the bot by one step on one table. Stateless and idempotent. */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!configResult.ok || !runtime || !limiter) {
    console.error(configResult.ok ? "runtime missing" : configResult.error);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, reason: "server_misconfigured" }));
    return;
  }
  const config = configResult.data;
  let body: unknown = null;
  try {
    body = req.method === "POST" ? await readJson(req) : null;
  } catch {
    body = undefined; // schema validation turns this into a 400
  }

  const result = await handleBotRequest(
    { method: req.method ?? "GET", headers: req.headers as Record<string, string | undefined>, body },
    {
      config,
      limiter,
      verifyToken: async (accessToken) => {
        try {
          const claims = await verifyAccessToken({
            access_token: accessToken,
            app_id: config.privyAppId,
            verification_key: config.privyVerificationKey,
          });
          return { userId: claims.user_id };
        } catch {
          return null;
        }
      },
      verifySignature: async (address, message, signature) => {
        try {
          return await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
          });
        } catch {
          return false;
        }
      },
      chain: runtime.chain,
      decryptCard: runtime.decryptCard,
      random: Math.random,
    },
  );

  res.statusCode = result.status;
  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  res.setHeader("content-type", "application/json");
  res.end(result.body === null ? "" : JSON.stringify(result.body));
}
