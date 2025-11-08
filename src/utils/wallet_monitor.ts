import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import Database from "better-sqlite3";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

// --- Types
type Position = {
  mint: string;
  entry_ts: number;
  entry_price: number;
  size_tokens: number;
  entry_sol: number;
};

// --- Database
const dbPath = path.join(process.cwd(), "data", "pumpbot.sqlite");
const db = new Database(dbPath);

// --- Mock price generator (for paper trades)
function mockPrice(entry: number): number {
  const change = (Math.random() - 0.5) * 0.2; // ±10%
  return entry * (1 + change);
}

// --- Main loop
async function main() {
  const rpcUrl = process.env.RPC_URL_PRIMARY!;
  const conn = new Connection(rpcUrl, "confirmed");
  const walletAddr = process.env.WALLET_ADDRESS;

  if (!walletAddr) {
    console.error("❌ WALLET_ADDRESS missing in .env");
    process.exit(1);
  }

  const wallet = new PublicKey(walletAddr);


  const positions = db.prepare("SELECT * FROM positions").all() as Position[];

  console.clear();
  console.log("📊 Open Positions");

  if (positions.length > 0) {
    let totalEntrySol = 0;
    let totalCurrSol = 0;

    const rows = positions.map((p) => {
      const mockCurrPrice = mockPrice(p.entry_price);
      const currSolValue =
        (p.size_tokens * mockCurrPrice) / p.entry_price * (p.entry_sol / p.size_tokens);
      const pnl = ((currSolValue - p.entry_sol) / p.entry_sol) * 100;

      totalEntrySol += p.entry_sol;
      totalCurrSol += currSolValue;

      return {
        mint: p.mint,
        entry: p.entry_price.toFixed(4),
        current: mockCurrPrice.toFixed(4),
        pnl: (pnl >= 0 ? "+" : "") + pnl.toFixed(2) + "%",
      };
    });

    console.table(rows);
    const totalPnL = ((totalCurrSol - totalEntrySol) / totalEntrySol) * 100;
    console.log(`💰 Portfolio PnL: ${(totalPnL >= 0 ? "+" : "") + totalPnL.toFixed(2)}%\n`);
  } else {
    console.log("📭 No active positions found.\n");
  }

  // --- Wallet monitor
  try {
    const balanceLamports = await conn.getBalance(wallet);
    const solBalance = balanceLamports / LAMPORTS_PER_SOL;

    console.log("💰 Real-Time Wallet Monitor");
    console.log("---------------------------");
    console.log(`🔗 RPC: ${rpcUrl}`);
    console.log(`🪪 Address: ${wallet.toBase58()}`);
    console.log(`💵 Balance: ${solBalance.toFixed(4)} SOL`);
    console.log(`⏰ Last Updated: ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error("❌ Error fetching wallet balance:", err);
  }
}

// --- Loop every 5s
setInterval(main, 5000);
main();
