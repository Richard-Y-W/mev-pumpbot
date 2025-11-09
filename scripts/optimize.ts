// scripts/optimize.ts
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import chalk from "chalk";

// Path to your summary file
const SUMMARY_PATH = path.join("data", "backtest_summary.csv");

if (!fs.existsSync(SUMMARY_PATH)) {
  console.error(chalk.red(`❌ Summary file not found: ${SUMMARY_PATH}`));
  process.exit(1);
}

const raw = fs.readFileSync(SUMMARY_PATH, "utf8").trim();

// Parse CSV safely
let records: any[] = [];
try {
  records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });
} catch (err) {
  console.error(chalk.red("❌ Failed to parse CSV"), err);
  process.exit(1);
}

if (!records.length) {
  console.error(chalk.red("❌ No results parsed — check CSV format"));
  process.exit(1);
}

// Compute best config based on weighted criteria
// (70% weight on avg_pnl, 30% on win_rate)
const scored = records.map((r) => {
  const pnl = parseFloat(r.avg_pnl);
  const win = parseFloat(r.win_rate);
  const score = pnl * 0.7 + win * 0.3;
  return { ...r, pnl, win, score };
});

// Find best
scored.sort((a, b) => b.score - a.score);
const best = scored[0];

console.log(chalk.green(`\n📊 Parsed ${records.length} summary rows.`));
console.log(chalk.cyan(`🏆 Best configuration:`));
console.table({
  tp1: best.tp1,
  tp2: best.tp2,
  stop: best.stop,
  maxHold: best.maxHold,
  win_rate: `${best.win_rate}%`,
  avg_pnl: `${best.avg_pnl}%`,
  score: best.score.toFixed(2),
});

// Write to a file for later (optional)
const OUTPUT_PATH = path.join("data", "best_config.json");
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(best, null, 2));
console.log(chalk.gray(`\n📄 Saved best config → ${OUTPUT_PATH}\n`));
