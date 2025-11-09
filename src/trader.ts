// src/trader.ts
import fs from "fs";
import { scoreToken } from "./scoring";
import { riskCheck } from "./risk";
import { insertDecision, db } from "./utils/store";
import { randomUUID } from "crypto";
import chalk from "chalk";
import { Connection, PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();

type ScoreTokenResult = { total?: number; score?: number };

interface SimTrade {
  id: string;
  mint: string;
  entryPrice: number;
  entrySol: number;
  sizeTokens: number;
  status: "OPEN" | "CLOSED";
  pnl: number;
}

/** -------------------------------------
 *  🧠 Snapshot logger — builds ML dataset
 *  ------------------------------------ */
function logSnapshot(
  mint: string,
  score: number,
  buyers: number,
  txRate: number
) {
  const file = "data/snapshots.csv";
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "ts,mint,score,buyers,txRate\n");
  }
  const line = `${Date.now()},${mint},${score.toFixed(3)},${buyers},${txRate}\n`;
  fs.appendFileSync(file, line);
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
  const buyers = Math.floor(Math.random() * 100);   // mock buyers
  const txRate = Math.random() * 10;                // mock tx/min
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

  // 3️⃣ Log result + dataset snapshot
  logSnapshot(mint, score, buyers, txRate);

  if (pnl >= 0) {
    console.log(chalk.green(`💰 Closed simulated trade on ${mint} | PnL: +${pnl.toFixed(2)}%`));
  } else {
    console.log(chalk.red(`📉 Closed simulated trade on ${mint} | PnL: ${pnl.toFixed(2)}%`));
  }

  insertDecision.run(Date.now(), mint, score, "SIM_TRADE", JSON.stringify({ pnl }), sizeSol, "dry-run");
  return "dry-run";
}

/**
 * Handles new Pump.fun events (used by pumpListener.ts)
 */
export async function handleEvent({ mint, dryRun = true }: { mint: string; dryRun?: boolean }) {
  try {
    console.log(chalk.cyan(`🔍 Handling event for mint: ${mint}`));

    const connection = new Connection(process.env.RPC_URL_PRIMARY!, "confirmed");
    const pubkey = new PublicKey(mint);

    // --- 1️⃣ Run risk checks ---
    const risk = await riskCheck(pubkey, connection);
    if (!risk.pass) {
      console.log(chalk.red(`❌ Rejected by risk checks: ${mint}`));
      insertDecision.run(Date.now(), mint, 0, "REJECT", JSON.stringify(risk.reasons), 0, "");
      return;
    }

    // --- 2️⃣ Score token ---
    const scoreResult = await scoreToken(mint);
    const scoreValue = (scoreResult as ScoreTokenResult).total ?? (scoreResult as ScoreTokenResult).score ?? 0;


    console.log(chalk.yellow(`⭐ Score for ${mint}: ${scoreValue.toFixed(2)}`));

    // --- 3️⃣ If dry run: simulate entry ---
    if (dryRun) {
      db.prepare(
        `INSERT OR IGNORE INTO positions (mint, entry_ts, entry_price, size_tokens, entry_sol)
         VALUES (?, ?, ?, ?, ?)`
      ).run(mint, Date.now(), 0.0001, 100000, Number(process.env.MAX_TRADE_SOL || 0.15));

      console.log(
        chalk.green(`✅ Simulated entry for ${mint} | score=${scoreValue.toFixed(2)} | dryRun=${dryRun}`)
      );

      // Log dataset snapshot (lightweight version)
      logSnapshot(mint, scoreValue, Math.floor(Math.random() * 100), Math.random() * 10);

      return;
    }

    // --- 4️⃣ If live trading enabled ---
    console.log(chalk.red(`⚠️ Real trading not yet implemented for ${mint}`));
  } catch (err) {
    console.error(chalk.red(`⚠️ handleEvent error:`), err);
  }
}

// --- standalone test mode
if (require.main === module) {
  (async () => {
    const mint = "So11111111111111111111111111111111111111112"; // safe test mint
    await simulateTrade(mint, "BUY");
  })();
}
