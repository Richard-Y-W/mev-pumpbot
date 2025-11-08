import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";

export type RiskResult = {
  pass: boolean;
  reasons: {
    authoritiesRevoked: boolean;
    sellSimulationOk: boolean;
  };
};

/**
 * ✅ Checks if mint and freeze authorities are revoked
 */
export async function authoritiesRevoked(
  mint: PublicKey,
  conn: Connection
): Promise<boolean> {
  try {
    const mintInfo = await getMint(conn, mint);
    const mintRevoked =
      mintInfo.mintAuthority === null ||
      mintInfo.mintAuthority.toBase58() === "";
    const freezeRevoked =
      mintInfo.freezeAuthority === null ||
      mintInfo.freezeAuthority.toBase58() === "";
    return mintRevoked && freezeRevoked;
  } catch (err) {
    console.error("❌ Authority check failed:", err);
    return false;
  }
}

/**
 * ✅ Simulates a minimal SELL transaction to detect honeypots or high tax
 * For now this just returns true (placeholder). We'll extend it later.
 */
export async function simulateSellPossible(
  mint: PublicKey,
  conn: Connection
): Promise<boolean> {
  try {
    // TODO: implement actual simulateTransaction() on Pump.fun or Raydium
    return true; // assume ok for MVP
  } catch (err) {
    console.error("❌ Sell simulation failed:", err);
    return false;
  }
}

/**
 * ✅ Combines both checks
 */
export async function riskCheck(
  mint: PublicKey,
  conn: Connection
): Promise<RiskResult> {
  const okAuth = await authoritiesRevoked(mint, conn);
  const okSell = await simulateSellPossible(mint, conn);
  const pass = okAuth && okSell;

  return {
    pass,
    reasons: {
      authoritiesRevoked: okAuth,
      sellSimulationOk: okSell,
    },
  };
}
