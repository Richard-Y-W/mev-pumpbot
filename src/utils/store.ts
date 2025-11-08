import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dbPath = path.join(process.cwd(), "data", "pumpbot.sqlite");
fs.mkdirSync("data", { recursive: true });
export const db = new Database(dbPath);

// initialize tables
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS events(
  ts INTEGER,
  mint TEXT,
  kind TEXT,
  buyers1m INTEGER,
  buys1m INTEGER,
  sells1m INTEGER,
  curve_progress REAL,
  price REAL,
  unique_buyers5m INTEGER
);
CREATE TABLE IF NOT EXISTS decisions(
  ts INTEGER,
  mint TEXT,
  score REAL,
  action TEXT,
  reason TEXT,
  size_sol REAL,
  tx TEXT
);
CREATE TABLE IF NOT EXISTS positions(
  mint TEXT PRIMARY KEY,
  entry_ts INTEGER,
  entry_price REAL,
  size_tokens REAL,
  entry_sol REAL
);
`);

export const insertDecision = db.prepare(
  "INSERT INTO decisions(ts,mint,score,action,reason,size_sol,tx) VALUES(?,?,?,?,?,?,?)"
);


export function storeTrade(trade: {
  id: string;
  mint: string;
  entryPrice: number;
  entrySol: number;
  sizeTokens: number;
  status: string;
  pnl: number;
}) {
  try {
    db.prepare(
      `INSERT INTO decisions(ts, mint, score, action, reason, size_sol, tx)
       VALUES(?, ?, ?, ?, ?, ?, ?)`
    ).run(
      Date.now(),
      trade.mint,
      trade.pnl, // using PnL as score placeholder
      trade.status,
      "simulated_trade",
      trade.entrySol,
      trade.id
    );
    console.log("💾 Trade stored in DB");
  } catch (err) {
    console.error("DB insert error:", err);
  }
}


console.log("✅ SQLite initialized at", dbPath);
