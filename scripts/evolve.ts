// scripts/evolve.ts
import { spawnSync } from "child_process";
import fs from "fs";
import chalk from "chalk";
import path from "path";

// ------------------------------
// CONFIG
// ------------------------------
const POP_SIZE = 8;
const GENERATIONS = 10;
const MUTATION_RATE = 0.3;
const OUTPUT = "data/evolve_history.csv";

console.log(chalk.blueBright("🧬 Starting Genetic Optimization for 10 generations"));

// ------------------------------
// RUN BACKTEST with given params
// ------------------------------
function runBacktest(params: any) {
  // Pass params to backtest via env vars
  const env = {
    ...process.env,
    STRAT_TP1: params.tp1,
    STRAT_TP2: params.tp2,
    STRAT_STOP: params.stop,
    STRAT_MAX_HOLD: params.maxHold,
  };

  const tsNodePath = path.join("node_modules", ".bin", "ts-node.cmd");

  // ✅ Windows-safe spawn
  const result = spawnSync(tsNodePath, ["scripts/backtest.ts"], {
    env,            // Pass environment vars to backtest
    stdio: "pipe",  // Capture output
    shell: true,    // Use shell for PowerShell/Windows CMD compatibility
    encoding: "utf-8",
  });

  if (result.error) {
    console.error("❌ Backtest failed:", result.error);
    return { win: 0, pnl: -999, score: -999 };
  }

  // --- Parse backtest_summary.csv last row ---
  const csvPath = "data/backtest_summary.csv";
  if (!fs.existsSync(csvPath)) {
    console.error("⚠️ No backtest_summary.csv found");
    return { win: 0, pnl: -999, score: -999 };
  }

  const csv = fs.readFileSync(csvPath, "utf8").trim().split("\n");
  const last = csv[csv.length - 1].split(",");
  const win = parseFloat(last[4]);
  const pnl = parseFloat(last[5]);
  const score = win + pnl / 2;
  return { win, pnl, score };
}

// ------------------------------
// MUTATION + EVOLUTION
// ------------------------------
function mutate(val: number, scale = 0.1) {
  return +(val + (Math.random() - 0.5) * scale).toFixed(2);
}

function crossover(a: any, b: any) {
  return {
    tp1: Math.random() < 0.5 ? a.tp1 : b.tp1,
    tp2: Math.random() < 0.5 ? a.tp2 : b.tp2,
    stop: Math.random() < 0.5 ? a.stop : b.stop,
    maxHold: Math.random() < 0.5 ? a.maxHold : b.maxHold,
  };
}

// ------------------------------
// INITIAL POPULATION
// ------------------------------
let population = Array.from({ length: POP_SIZE }, () => ({
  tp1: +(0.1 + Math.random() * 0.4).toFixed(2),
  tp2: +(0.3 + Math.random() * 0.5).toFixed(2),
  stop: +(-0.3 + Math.random() * 0.2).toFixed(2),
  maxHold: Math.floor(10 + Math.random() * 20),
}));

const history: any[] = [];
let bestOverall: any = null; // ✅ Global best tracker

// ------------------------------
// EVOLUTION LOOP
// ------------------------------
for (let gen = 1; gen <= GENERATIONS; gen++) {
  console.log(chalk.yellow(`\nGeneration ${gen}/${GENERATIONS}`));

  // Evaluate population
  const results = population.map((p) => ({ ...p, ...runBacktest(p) }));
  results.sort((a, b) => b.score - a.score);
  history.push(...results);

  // Track best for this generation
  const best = results[0];
  if (!bestOverall || best.score > bestOverall.score) bestOverall = best;

  console.table(results);
  console.log(
    chalk.green(
      `🏆 Best: tp1=${best.tp1} tp2=${best.tp2} stop=${best.stop} hold=${best.maxHold} | score=${best.score.toFixed(
        2
      )}`
    )
  );

  // Breed next generation
  const nextGen: any[] = [best]; // keep elite
  while (nextGen.length < POP_SIZE) {
    const a = results[Math.floor(Math.random() * 4)];
    const b = results[Math.floor(Math.random() * 4)];
    const child = crossover(a, b);
    if (Math.random() < MUTATION_RATE) {
      child.tp1 = mutate(child.tp1);
      child.tp2 = mutate(child.tp2);
      child.stop = mutate(child.stop);
    }
    nextGen.push(child);
  }

  population = nextGen;
}

// ------------------------------
// SAVE OUTPUTS
// ------------------------------
fs.writeFileSync(
  OUTPUT,
  [
    "tp1,tp2,stop,maxHold,win,pnl,score",
    ...history.map((r) =>
      [r.tp1, r.tp2, r.stop, r.maxHold, r.win, r.pnl, r.score].join(",")
    ),
  ].join("\n")
);

fs.writeFileSync(
  "data/best_config_genetic.json",
  JSON.stringify(bestOverall, null, 2)
);

console.log(chalk.gray(`\n📄 Evolution history saved → ${OUTPUT}`));
console.log(chalk.green("✅ Final evolved config → data/best_config_genetic.json"));
