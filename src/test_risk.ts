import dotenv from "dotenv";
dotenv.config();
import { Connection, PublicKey } from "@solana/web3.js";
import { riskCheck } from "./risk";

const conn = new Connection(process.env.RPC_URL_PRIMARY!, "confirmed");

(async () => {
  const testMint = new PublicKey("So11111111111111111111111111111111111111112"); // Wrapped SOL
  const result = await riskCheck(testMint, conn);
  console.log("Risk result:", result);
})();
