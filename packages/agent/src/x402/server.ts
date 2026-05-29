import express, { type Request, type Response, type NextFunction } from "express";
import { config } from "../config.js";

/**
 * x402 agentic-payments endpoint.
 *
 * Exposes a *paid* premium action — an on-demand priority risk evaluation /
 * managed exit — gated by the HTTP 402 flow. A calling agent receives a 402 with
 * the payment requirements, signs a stablecoin payment (USDC via EIP-3009), and
 * retries with an `X-PAYMENT` header; a facilitator verifies + settles on
 * Arbitrum before the action runs.
 *
 * This file implements the x402 *protocol shape* with plain Express so it builds
 * with no extra dependencies. In production, replace `x402Gate` with the official
 * middleware and the Coinbase CDP facilitator:
 *
 *   import { paymentMiddleware } from "@x402/express";
 *   app.use(paymentMiddleware(payTo, { "POST /priority-exit": { price: "$0.50",
 *     network: "eip155:421614" } }, { url: facilitatorUrl }));
 *
 * The CDP facilitator supports Arbitrum and bills $0.001/settled payment after a
 * free monthly tier.
 */

interface PaymentRequirements {
  scheme: "exact";
  network: string; // CAIP-2, e.g. "eip155:421614"
  maxAmountRequired: string; // atomic units of the asset
  resource: string;
  description: string;
  payTo: string;
  asset: string; // token contract (USDC)
  facilitator: string;
}

function buildRequirements(resource: string): PaymentRequirements {
  const network = `eip155:${config.CHAIN_ID}`;
  return {
    scheme: "exact",
    network,
    maxAmountRequired: "500000", // 0.50 USDC (6 decimals)
    resource,
    description: "Aegis priority crisis evaluation + managed exit",
    payTo: config.X402_PAY_TO ?? "0x0000000000000000000000000000000000000000",
    asset: "USDC",
    facilitator: config.X402_FACILITATOR_URL,
  };
}

/** Minimal, spec-shaped 402 gate. Swap for `@x402/express` + CDP in production. */
function x402Gate(req: Request, res: Response, next: NextFunction) {
  const payment = req.header("X-PAYMENT");
  if (!payment) {
    const requirements = buildRequirements(req.path);
    // Per the x402 spec, advertise requirements in the 402 body + header.
    res
      .status(402)
      .set("X-PAYMENT-REQUIRED", Buffer.from(JSON.stringify(requirements)).toString("base64"))
      .json({ x402Version: 1, error: "payment required", accepts: [requirements] });
    return;
  }
  // A real facilitator call verifies + settles here. For local runs we accept a
  // well-formed header so the flow is demonstrable end-to-end.
  // verifyAndSettle(payment, buildRequirements(req.path)) -> { settled, txHash }
  res.locals.paymentVerified = true;
  next();
}

export function createX402Server() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true, network: `eip155:${config.CHAIN_ID}` }));

  // The gated premium action.
  app.post("/priority-exit", x402Gate, async (req: Request, res: Response) => {
    const { user } = req.body ?? {};
    // Here the agent would trigger an immediate ExecutorClient.evaluateAndExit(user, ...)
    // using freshly pulled signals. Returned to the paying agent as the receipt.
    res.json({
      ok: true,
      paid: res.locals.paymentVerified === true,
      action: "priority-exit",
      user: user ?? null,
      note: "Wire ExecutorClient here to run the bounded exit on payment settlement.",
    });
  });

  return app;
}

// Allow running standalone: `npm run x402`.
const isMain =
  typeof process !== "undefined" && process.argv[1]?.endsWith("x402/server.ts");
if (isMain) {
  const app = createX402Server();
  app.listen(config.X402_PORT, () => {
    console.log(`[x402] paid-action server on :${config.X402_PORT} (network eip155:${config.CHAIN_ID})`);
  });
}
