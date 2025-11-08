import { Connection, PublicKey, Logs } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();

const PROGRAM_PUMPFUN = new PublicKey("9TgQSYHFNDFN2CqV2Q9C3jCtp4ksG1J2NsKyGJzjJjWx");

export type TokenEvent = {
  mint: string;
  kind: "NEW" | "BUY" | "SELL";
  slot: number;
  raw: string;
};

export function startListener(onEvent: (e: TokenEvent) => void) {
  const rpcUrl = process.env.RPC_URL_PRIMARY!;
  const conn = new Connection(rpcUrl, "confirmed");

  console.log("👂 Listening to Pump.fun program logs...");

  conn.onLogs(PROGRAM_PUMPFUN, (logObj: Logs) => {
    const logs = (logObj as any).logs?.join("\n") || "";
    const slot = (logObj as any).context?.slot || 0;

    // --- Simple detection rules ---
    if (logs.includes("initialize") || logs.includes("InitializeMint")) {
      console.log("🚀 New token detected at slot", slot);
      onEvent({ mint: "unknown_mint_yet", kind: "NEW", slot, raw: logs });
    } else if (logs.includes("buy")) {
      console.log("💸 Buy detected at slot", slot);
      onEvent({ mint: "unknown_mint_yet", kind: "BUY", slot, raw: logs });
    } else if (logs.includes("sell")) {
      console.log("🔻 Sell detected at slot", slot);
      onEvent({ mint: "unknown_mint_yet", kind: "SELL", slot, raw: logs });
    }
  });
}

// quick standalone test
if (require.main === module) {
  startListener((e) => {
    console.log("📡 Event received:", e);
  });
}
