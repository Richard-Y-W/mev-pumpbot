import { scoreToken } from "./scoring";
import { riskCheck } from "./risk";
import { insertDecision } from "./utils/store";
import { randomUUID } from "crypto";
import chalk from "chalk";
import { Connection, PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();

interface SimTrade {
  id: string;
  mint: string;
  entryPrice: number;
  entrySol: number;
  sizeTokens: number;
  status: "OPEN" | "CLOSED";
  pnl: number;
}

/**
 * Simulates a BUY/SELL trade — used for DRY_RUN backtesting and orchestration testing.
 */
export async function simulateTrade(
  mint: string,
  action: "BUY" | "SELL" = "BUY",
  conn?: Connection
): Promise<string> {
  console.log(chalk.cyan(`\n🔧 Simulating ${action} for ${mint} (DRY_RUN=${process.env.DRY_RUN})`));

  // use a real connection if not passed
  const connection = conn ?? new Connection(process.env.RPC_URL_PRIMARY!, "confirmed");
  const pubkey = new PublicKey(mint);

  // 1️⃣ Run risk checks
  const risk = await riskCheck(pubkey, connection);
  if (!risk.pass) {
    console.log(chalk.red(`❌ Risk failed: ${JSON.stringify(risk.reasons)}`));
    insertDecision.run(Date.now(), mint, 0, "REJECT", JSON.stringify(risk.reasons), 0, "");
    return "rejected-risk";
  }

  // 2️⃣ Mock scoring + trade
  const score = Math.random();
  const entryPrice = 0.0001 + Math.random() * 0.001;
  const sizeSol = Number(process.env.MAX_TRADE_SOL || 0.15);
  const exitPrice = entryPrice * (1 + (Math.random() - 0.5) * 0.4);
  const pnl = ((exitPrice - entryPrice) / entryPrice) * 100;

  const trade: SimTrade = {
    id: randomUUID(),
    mint,
    entryPrice,
    entrySol: sizeSol,
    sizeTokens: sizeSol / entryPrice,
    status: "CLOSED",
    pnl: Number(pnl.toFixed(2)),
  };

  if (pnl >= 0) {
    console.log(chalk.green(`💰 Closed simulated trade on ${mint} | PnL: +${pnl.toFixed(2)}%`));
  } else {
    console.log(chalk.red(`📉 Closed simulated trade on ${mint} | PnL: ${pnl.toFixed(2)}%`));
  }

  insertDecision.run(Date.now(), mint, score, "SIM_TRADE", JSON.stringify({ pnl }), sizeSol, "dry-run");
  return "dry-run";
}

// --- standalone test mode
if (require.main === module) {
  (async () => {
    const mint = "So11111111111111111111111111111111111111112"; // safe test mint
    await simulateTrade(mint, "BUY");
  })();
}
