import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import dotenv from "dotenv";
import bs58 from "bs58";

dotenv.config();

async function main() {
  const conn = new Connection(process.env.RPC_URL_PRIMARY!, "confirmed");
  const secret = bs58.decode(process.env.PRIVATE_KEY_BASE58!);
  const kp = Keypair.fromSecretKey(secret);
  const pub = kp.publicKey;

  console.log("🔗 Connected to Solana RPC:", process.env.RPC_URL_PRIMARY);
  console.log("🪪 Wallet Address:", pub.toBase58());

  const balanceLamports = await conn.getBalance(pub);
  console.log("💰 Balance:", (balanceLamports / LAMPORTS_PER_SOL).toFixed(4), "SOL");

  const slot = await conn.getSlot();
  console.log("📦 Current slot:", slot);
}

main().catch((err) => console.error("❌ Error:", err));
