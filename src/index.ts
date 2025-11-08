import dotenv from "dotenv";
dotenv.config();
import chalk from "chalk";
import { Connection, PublicKey } from "@solana/web3.js";

import { startListener, TokenEvent } from "./listener";
import { riskCheck } from "./risk";
import { scoreToken } from "./scoring";
import { simulateTrade } from "./trader";
import { insertDecision } from "./utils/store";
import { runStrategyLoop } from "./strategy";

const conn = new Connection(process.env.RPC_URL_PRIMARY!, "confirmed");
const DRY_RUN = process.env.DRY_RUN === "true";
const SCORE_THRESHOLD = 0.7;

console.log(
  chalk.cyan(
    `🧠 Pumpbot orchestrator starting (DRY_RUN=${DRY_RUN}) | RPC=${process.env.RPC_URL_PRIMARY}`
  )
);

/**
 * Handle events detected by listener
 */
async function handleEvent(e: TokenEvent) {
  if (e.kind !== "NEW") return;

  const mint = new PublicKey(e.mint);
  console.log(chalk.blue(`\n🚀 Detected new token: ${mint.toBase58()}`));

  // 1️⃣ Risk checks
  const risk = await riskCheck(mint, conn);
  if (!risk.pass) {
    insertDecision.run(Date.now(), e.mint, 0, "REJECT", JSON.stringify(risk.reasons), 0, "");
    console.log(chalk.red("❌ Failed risk checks, skipping."));
    return;
  }

  // 2️⃣ Scoring
  const s = await scoreToken(e.mint);
  const score = s.total ?? 0;
  console.table(s);

  if (score >= SCORE_THRESHOLD) {
    const sizeSol = Number(process.env.MAX_TRADE_SOL || 0.1);
    const sig = await simulateTrade(e.mint); // DRY_RUN safe
    insertDecision.run(Date.now(), e.mint, score, "BUY", "auto_threshold", sizeSol, sig);
    console.log(chalk.green(`✅ Auto-BUY triggered for ${e.mint}`));
  } else {
    insertDecision.run(Date.now(), e.mint, score, "WATCH", "below_threshold", 0, "");
    console.log(chalk.gray(`👀 WATCH only (score=${score.toFixed(2)})`));
  }
}

/**
 * Main orchestrator
 */
async function main() {
  // --- Start strategy manager ---
  console.log(chalk.magenta("🧩 Strategy manager running every 2 minutes..."));
  setInterval(async () => {
    try {
      await runStrategyLoop();
    } catch (err) {
      console.error(chalk.red("⚠️ Strategy loop error:"), err);
    }
  }, 2 * 60 * 1000); // 2 min interval

  // --- Start listener for new tokens ---
  startListener(async (e) => {
    try {
      await handleEvent(e);
    } catch (err) {
      console.error(chalk.red("❌ Error handling event:"), err);
    }
  });

  console.log(chalk.cyan("🏁 Pumpbot running — waiting for events..."));
}

// --- Run main ---
if (require.main === module) {
  main().catch((err) => console.error(err));
}
