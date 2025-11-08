import fetch from "node-fetch";
import { Connection, PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();

export interface ScoreResult {
  mint: string;
  flow: number;
  liquidity: number;
  curve: number;
  social: number;
  total: number;
}

// helper for safe range clamp
function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

// --- mock helpers for now (can plug in real APIs later)
async function getLiquidityScore(mint: string): Promise<number> {
  // simulate fetching LP size from Pump.fun or Raydium
  const simulatedLpSol = Math.random() * 20; // pretend it's 0-20 SOL
  return clamp(simulatedLpSol / 20, 0, 1); // normalize 0-1
}

async function getFlowScore(mint: string): Promise<number> {
  // ratio of buys to sells in first blocks
  const buy = Math.floor(Math.random() * 20);
  const sell = Math.floor(Math.random() * 20);
  if (buy + sell === 0) return 0;
  return clamp(buy / (buy + sell), 0, 1);
}

async function getCurveScore(mint: string): Promise<number> {
  // proxy for smooth price appreciation (mock)
  const noise = Math.random() * 0.3;
  return clamp(1 - noise, 0, 1);
}

async function getSocialScore(mint: string): Promise<number> {
  // could integrate with DexScreener, Pump.fun metadata, etc.
  const verified = Math.random() > 0.8; // 20% chance verified
  return verified ? 1 : 0.3 + Math.random() * 0.4;
}

export async function scoreToken(mint: string): Promise<ScoreResult> {
  const [flow, liquidity, curve, social] = await Promise.all([
    getFlowScore(mint),
    getLiquidityScore(mint),
    getCurveScore(mint),
    getSocialScore(mint),
  ]);

  const total =
    flow * 0.4 +
    liquidity * 0.3 +
    curve * 0.2 +
    social * 0.1;

  return {
    mint,
    flow,
    liquidity,
    curve,
    social,
    total: Number(total.toFixed(3)),
  };
}

// --- test entrypoint (optional standalone run)
if (require.main === module) {
  (async () => {
    const testMint = "ExampleMintAddress123";
    const result = await scoreToken(testMint);
    console.table(result);
  })();
}



// src/scoring.ts
export const SCORE_THRESHOLD = 0.7;

export async function scoreMint(mint: string) {
  const result = {
    mint,
    flow: Math.random(),
    liquidity: Math.random(),
    curve: Math.random(),
    social: Math.random(),
  };

  const total =
    0.25 * result.flow +
    0.25 * result.liquidity +
    0.25 * result.curve +
    0.25 * result.social;

  return { ...result, total };
}
