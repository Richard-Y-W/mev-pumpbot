import fs from "fs";
import path from "path";
import chalk from "chalk";
import { scoreToken } from "../src/scoring";
import { decideExit, STRATEGY_PARAMS } from "../src/strategy";
import { riskCheck } from "../src/risk";
import { Connection, PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();

const conn = new Connection(process.env.RPC_URL_PRIMARY!, "confirmed");

interface BacktestTrade {
  mint: string;
  entry_ts: number;
  entry_price: number;
  exit_price: number;
  pnl_pct: number;
  decision: string;
}

async function backtest(fromDays = 7) {
  console.log(chalk.cyan(`\n📊 Running backtest for last ${fromDays} days...`));

  const results: BacktestTrade[] = [];
  const start = Date.now() - fromDays * 24 * 60 * 60 * 1000;

  // --- mock 20 random tokens ---
  for (let i = 0; i < 20; i++) {
    const mint = "MockMint_" + (i + 1);
    const risk = await riskCheck(new PublicKey("So11111111111111111111111111111111111111112"), conn);
    if (!risk.pass) continue;

    const s = await scoreToken(mint);
    const score = s.total ?? 0;
    if (score < 0.6) continue;

    // Simulate entry + random PnL
    const entry_price = 0.0001 + Math.random() * 0.001;
    const change = 1 + (Math.random() - 0.5) * 0.5;
    const exit_price = entry_price * change;
    const pnl_pct = ((exit_price - entry_price) / entry_price) * 100;
    const decision = decideExit(pnl_pct / 100, 10, STRATEGY_PARAMS).action;

    results.push({
      mint,
      entry_ts: start + i * 60000,
      entry_price,
      exit_price,
      pnl_pct,
      decision,
    });
  }

  // --- save results ---
  const outPath = path.join("data", "backtest_results.csv");
  const header = "mint,entry_price,exit_price,pnl_pct,decision\n";
  const csv = header + results.map(r => `${r.mint},${r.entry_price},${r.exit_price},${r.pnl_pct},${r.decision}`).join("\n");
  fs.writeFileSync(outPath, csv);

  const avgPnL = results.reduce((a, b) => a + b.pnl_pct, 0) / results.length;
  const winRate = (results.filter(r => r.pnl_pct > 0).length / results.length) * 100;

  console.log(chalk.green(`\n✅ Backtest complete → ${results.length} trades simulated.`));
  console.log(chalk.yellow(`📈 Average PnL: ${avgPnL.toFixed(2)}% | Win rate: ${winRate.toFixed(1)}%`));
  console.log(chalk.gray(`📄 Saved to: ${outPath}\n`));
}

if (require.main === module) {
  backtest(7);
}
