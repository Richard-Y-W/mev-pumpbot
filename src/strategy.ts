// src/strategy.ts
import { db } from "./utils/store";
import chalk from "chalk";

interface Position {
  mint: string;
  entry_ts: number;
  entry_price: number;
  size_tokens: number;
  entry_sol: number;
}

// --- Environment Helper ---
function envNum(key: string, def: number) {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : def;
}

// --- Tunable Strategy Params (used in backtests & live) ---
export const STRATEGY_PARAMS = {
  tp1: envNum("STRAT_TP1", 0.25),
  tp2: envNum("STRAT_TP2", 0.50),
  stop: envNum("STRAT_STOP", -0.20),
  maxHoldMin: envNum("STRAT_MAX_HOLD", 15),
  staleMin: envNum("STRAT_STALE_MIN", 5), // used for stale data timeout
};

/**
 * Dynamic PnL logic: adjusts thresholds based on trade age
 */
function dynamicThresholds(
  pnlRatio: number,
  ageMin: number,
  p = STRATEGY_PARAMS
) {
  if (ageMin < 5)
    return {
      tp1: p.tp1 * 1.3,
      tp2: p.tp2 * 1.3,
      stop: p.stop * 1.5,
    };
  if (ageMin > 20)
    return {
      tp1: p.tp1 * 0.9,
      tp2: p.tp2 * 0.9,
      stop: p.stop * 0.8,
    };
  return p;
}

/**
 * Decide what to do with a position based on PnL, age, and last movement.
 */
export function decideExit(
  pnlRatio: number,
  ageMin: number,
  lastMoveMin: number,
  p: typeof STRATEGY_PARAMS = STRATEGY_PARAMS
) {
  const adj = dynamicThresholds(pnlRatio, ageMin, p);

  if (pnlRatio >= adj.tp2) return { action: "SELL_ALL", reason: "tp2" };
  if (pnlRatio >= adj.tp1) return { action: "SELL_HALF", reason: "tp1" };
  if (pnlRatio <= adj.stop) return { action: "STOP", reason: "stop_loss" };
  if (lastMoveMin >= p.staleMin)
    return { action: "TIMEOUT", reason: "stale_position" };
  if (ageMin >= p.maxHoldMin)
    return { action: "TIMEOUT", reason: "max_age" };

  return { action: "HOLD", reason: "no_signal" };
}

/**
 * Run adaptive exit strategy loop over all open positions.
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
    const drift = (Math.random() - 0.5) * 0.3;
    const momentumBias = 0.02 * Math.sign(Math.random() - 0.4);
    const priceChange = 1 + drift + momentumBias;
    const currPrice = pos.entry_price * priceChange;
    const pnlPct = ((currPrice - pos.entry_price) / pos.entry_price) * 100;
    const lastMoveMin = Math.random() * 15; // mock activity gap

    const decision = decideExit(pnlPct / 100, ageMin, lastMoveMin);

    switch (decision.action) {
      case "SELL_ALL":
      case "STOP":
      case "TIMEOUT":
        db.prepare("DELETE FROM positions WHERE mint = ?").run(pos.mint);
        db.prepare(
          "INSERT INTO decisions(ts, mint, score, action, reason, size_sol, tx, pnl, age_min) VALUES(?,?,?,?,?,?,?,?,?)"
        ).run(
          Date.now(),
          pos.mint,
          0,
          decision.action,
          decision.reason,
          pos.entry_sol,
          "dry-run",
          pnlPct.toFixed(2),
          ageMin.toFixed(1)
        );
        console.log(
          chalk.green(
            `✅ ${decision.action} on ${pos.mint} | ${decision.reason} | PnL ${pnlPct.toFixed(
              2
            )}%`
          )
        );
        break;

      case "SELL_HALF":
        db.prepare(
          "UPDATE positions SET size_tokens = size_tokens / 2 WHERE mint = ?"
        ).run(pos.mint);
        console.log(
          chalk.yellow(
            `⚡ Partial take-profit on ${pos.mint} | PnL ${pnlPct.toFixed(2)}%`
          )
        );
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

// Manual run
if (require.main === module) {
  (async () => {
    await runStrategyLoop();
  })();
}
