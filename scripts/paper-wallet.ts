import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const kp = Keypair.generate();
console.log("✅ Paper wallet generated!");
console.log("PUBLIC KEY:", kp.publicKey.toBase58());
console.log("PRIVATE KEY (BASE58):", bs58.encode(kp.secretKey));
