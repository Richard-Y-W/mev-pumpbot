import { db } from "./utils/store";
import chalk from "chalk";

// Define what a position looks like in SQLite
interface Position {
  mint: string;
  entry_ts: number;
  entry_price: number;
  size_tokens: number;
  entry_sol: number;
}

// Default strategy parameters
export const STRATEGY_PARAMS = {
  tp1: 0.25,       // +25% take-profit → sell half
  tp2: 0.50,       // +50% take-profit → sell rest
  stop: -0.20,     // −20% stop loss
  maxHoldMin: 15,  // timeout after 15 minutes
};

/**
 * Decide what to do with a position based on PnL and age.
 */
export function decideExit(pnlRatio: number, ageMin: number, p = STRATEGY_PARAMS) {
  if (pnlRatio >= p.tp2) return { action: "SELL_ALL", reason: "tp2" };
  if (pnlRatio >= p.tp1) return { action: "SELL_HALF", reason: "tp1" };
  if (pnlRatio <= p.stop) return { action: "STOP", reason: "stop" };
  if (ageMin >= p.maxHoldMin) return { action: "TIMEOUT", reason: "age" };
  return { action: "HOLD", reason: "hold" };
}

/**
 * Loop through open positions and update them using the strategy.
 * In DRY_RUN mode this only simulates exits.
 */
export async function runStrategyLoop() {
  const rows = db.prepare("SELECT * FROM positions").all() as Position[];

  if (!rows.length) {
    console.log(chalk.gray("No open positions to manage."));
    return;
  }

  const now = Date.now();

  for (const pos of rows) {
    const ageMin = (now - pos.entry_ts) / 60000;

    // mock price movement ±20 %
    const priceChange = 1 + (Math.random() - 0.5) * 0.4;
    const currPrice = pos.entry_price * priceChange;
    const pnlPct = ((currPrice - pos.entry_price) / pos.entry_price) * 100;

    const decision = decideExit(pnlPct / 100, ageMin);

    switch (decision.action) {
      case "SELL_ALL":
      case "STOP":
      case "TIMEOUT":
        db.prepare("DELETE FROM positions WHERE mint = ?").run(pos.mint);
        db.prepare(
          "INSERT INTO decisions(ts, mint, score, action, reason, size_sol, tx) VALUES(?,?,?,?,?,?,?)"
        ).run(Date.now(), pos.mint, 0, decision.action, decision.reason, pos.entry_sol, "dry-run");
        console.log(chalk.green(`✅ ${decision.action} on ${pos.mint} (${decision.reason})`));
        break;

      case "SELL_HALF":
        db.prepare(
          "UPDATE positions SET size_tokens = size_tokens / 2 WHERE mint = ?"
        ).run(pos.mint);
        console.log(chalk.yellow(`⚡ Partial take-profit on ${pos.mint}`));
        break;

      case "HOLD":
        console.log(
          chalk.gray(
            `⏸️ Holding ${pos.mint} | age=${ageMin.toFixed(1)}m | PnL=${pnlPct.toFixed(2)}%`
          )
        );
        break;
    }
  }
}

// --- Run manually if invoked directly
if (require.main === module) {
  (async () => {
    await runStrategyLoop();
  })();
}
