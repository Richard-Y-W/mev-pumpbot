// src/pumpListener.ts
import WebSocket from "ws";
import chalk from "chalk";
import fs from "fs";
import { handleEvent } from "./trader";
import dotenv from "dotenv";
dotenv.config();

const HELIUS_KEY = process.env.HELIUS_RPC?.split("api-key=")[1];
const PUMP_PROGRAM_ID = process.env.PUMP_PROGRAM_ID || "6EF8rRz5XhHLvLPWYt6XLcFAVt7gJj3QqY4r9YrVjC7J";
const DRY_RUN = process.env.DRY_RUN === "true";

// reconnect delay in ms
const RECONNECT_DELAY = 5000;
const HEARTBEAT_INTERVAL = 60 * 1000; // 1 min

let ws: WebSocket | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

export async function startPumpListener() {
  const url = `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
  ws = new WebSocket(url);

  ws.on("open", () => {
    console.log(chalk.green("✅ Connected to Helius WebSocket"));

    // Subscribe to *all* logs and filter manually for Pump.fun
    const sub = {
      jsonrpc: "2.0",
      id: "pumpfun_sub",
      method: "logsSubscribe",
      params: ["all", { commitment: "confirmed" }],
    };
    ws!.send(JSON.stringify(sub));

    // Heartbeat for visibility
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      console.log(chalk.red(`❤️ heartbeat - listener alive`));
    }, HEARTBEAT_INTERVAL);
  });

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      const logs = data?.params?.result?.value?.logs?.join("\n");
      if (!logs) return;

      // Optional: write raw data to log for debugging
      fs.appendFileSync("data/raw_helius.log", `[${new Date().toISOString()}]\n${msg.toString()}\n\n`);

      // Filter for Pump.fun program
      if (!logs.includes(PUMP_PROGRAM_ID)) return;

      // Detect token creation events
      if (logs.includes("InitializeMint") || logs.includes("CreateBondingCurve")) {
        const mintMatch = logs.match(/[A-Za-z0-9]{32,44}/g);
        const mint = mintMatch ? mintMatch[0] : "unknown";
        console.log(chalk.yellow(`🪙 New Pump.fun token: ${mint}`));

        await handleEvent({ mint, dryRun: DRY_RUN });
      }
    } catch (e) {
      console.error(chalk.red("⚠️ Listener error:"), e);
    }
  });

  ws.on("close", () => {
    console.log(chalk.red("❌ WebSocket closed, reconnecting..."));
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    setTimeout(startPumpListener, RECONNECT_DELAY);
  });

  ws.on("error", (err) => {
    console.error(chalk.red("⚠️ WebSocket error:"), err);
  });
}

// If run directly
if (require.main === module) {
  startPumpListener();
}
