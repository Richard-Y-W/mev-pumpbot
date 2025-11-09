// scripts/backtest.ts
import { decideExit, STRATEGY_PARAMS } from "../src/strategy";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import dotenv from "dotenv";
dotenv.config();

// --- Deterministic randomness (reproducible runs) ---
import seedrandom from "seedrandom";
const rng = seedrandom("RichardBacktestSeed");
//Math.random = rng as unknown as () => number; // quiet TS, keep reproducible

// Where to save detailed rows
const OUTPUT_PATH = path.join("data", "backtest_results.csv");
// Where to append summary (one line per run/param-set)
const SUMMARY_PATH = path.join("data", "backtest_summary.csv");

// Read strategy params from env (fallback to STRATEGY_PARAMS defaults)
function readParamsFromEnv() {
  return {
    tp1: parseFloat(process.env.STRAT_TP1 ?? STRATEGY_PARAMS.tp1.toString()),
    tp2: parseFloat(process.env.STRAT_TP2 ?? STRATEGY_PARAMS.tp2.toString()),
    stop: parseFloat(process.env.STRAT_STOP ?? STRATEGY_PARAMS.stop.toString()),
    maxHoldMin: parseInt(
      process.env.STRAT_MAX_HOLD ?? STRATEGY_PARAMS.maxHoldMin.toString(),
      10
    ),
    staleMin: 5
  };
}

(async () => {
  console.log("\n📊 Running backtest for last 7 days...\n");

  // Ensure data/ exists
  fs.mkdirSync("data", { recursive: true });

  const params = readParamsFromEnv();
  console.log(chalk.gray("Using strategy params:"), params);

  // --- 1️⃣ Generate mock positions (12 samples, reproducible) ---
  const mockPositions = Array.from({ length: 12 }).map((_, i) => ({
    mint: `MockMint_${i}`,
    entry_price: 0.0001 + Math.random() * 0.001,
    // simulate a random exit price (symmetric-ish)
    exit_price: 0.0001 + Math.random() * 0.001,
  }));

  const results: Array<{
    mint: string;
    entry_price: number;
    exit_price: number;
    pnl_pct: number;
    decision: string;
  }> = [];

  // --- 2️⃣ Simulate trades with your strategy thresholds ---
  for (const p of mockPositions) {
    const pnl_pct = ((p.exit_price - p.entry_price) / p.entry_price) * 100;

    // decideExit signature: (pnlRatio: number, ageMin: number, params?)
//  pass pnl as ratio (not percent), a fixed age (e.g., 10m) for backtest,
//  and the env-driven params so the optimizer/tuner can change them.
    const decision = decideExit(pnl_pct / 100, 10, 5, params).action;

    results.push({
      mint: p.mint,
      entry_price: p.entry_price,
      exit_price: p.exit_price,
      pnl_pct,
      decision,
    });
  }

  // --- 3️⃣ Save row-level results (CSV) ---
  const header = "mint,entry_price,exit_price,pnl_pct,decision";
  const lines = results.map((r) =>
    [
      r.mint,
      r.entry_price.toFixed(6),
      r.exit_price.toFixed(6),
      r.pnl_pct.toFixed(4),
      r.decision,
    ].join(",")
  );
  fs.writeFileSync(OUTPUT_PATH, [header, ...lines].join("\n"));

  // --- 4️⃣ Compute and print summary ---
  const pnlArray = results.map((r) => r.pnl_pct);
  const avgPnl = pnlArray.reduce((a, b) => a + b, 0) / pnlArray.length;
  const winRate =
    (results.filter((r) => r.pnl_pct > 0).length / results.length) * 100;

  console.log(
    chalk.green(
      `✅ Backtest complete → ${results.length} trades simulated.\n📈 Average PnL: ${avgPnl.toFixed(
        2
      )}% | Win rate: ${winRate.toFixed(1)}%`
    )
  );
  console.log(chalk.gray(`📄 Saved to: ${OUTPUT_PATH}`));

  // --- 5️⃣ Append to summary file (used by optimize.ts / evolve.ts) ---
  const summaryHeader = "tp1,tp2,stop,maxHoldMin,win_rate,avg_pnl";
  if (!fs.existsSync(SUMMARY_PATH)) {
    fs.writeFileSync(SUMMARY_PATH, summaryHeader + "\n");
  }
  const summaryRow = [
    params.tp1,
    params.tp2,
    params.stop,
    params.maxHoldMin,
    winRate.toFixed(2),
    avgPnl.toFixed(2),
  ].join(",");
  fs.appendFileSync(SUMMARY_PATH, summaryRow + "\n");
  console.log(chalk.cyan(`📄 Summary saved → ${SUMMARY_PATH}`));
})();
