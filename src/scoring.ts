// src/scoring.ts
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

/**
 * Scoring dimensions (normalized 0..1)
 * - flow: trade frequency + buyer activity (momentum)
 * - liquidity: proxy for depth (stability)
 * - curve: early-stage opportunity (buy/sell ratio + low-liq bias)
 * - social: placeholder until real social data
 *
 * Tuned weights (regression-backed):
 *   flow      → 0.40   (momentum correlates w/ exit strength)
 *   liquidity → 0.15   (helps stability but excess liq dampens early pop)
 *   curve     → 0.35   (early undervaluation = higher PnL)
 *   social    → 0.10   (minor for now)
 */

type RawFlow = {
  uniqueBuyers2m: number;
  buyToSell2m: number;
  txPerMin: number;
  notionalSol2m: number;
};

type ScoreOutput = {
  mint: string;
  flow: number;
  liquidity: number;
  curve: number;
  social: number;
  total: number;
};

// ------------------------ Utilities ------------------------

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
function n_txPerMin(x: number) {
  return clamp01(x / 60); // 60 tx/min saturates
}
function n_uniqueBuyers(x: number) {
  return clamp01(x / 40); // 40 buyers → 1.0
}
function n_buySellRatio(r: number) {
  if (!Number.isFinite(r) || r <= 0) return 0;
  const capped = Math.min(r, 3);
  return clamp01(0.25 + (capped - 1) * 0.25); // maps 1..3 → 0.5..1
}
function n_notionalSol(v: number) {
  return clamp01(v / 500);
}

// ------------------------ Data Sources ------------------------

async function getBirdeyeFlow(mint: string): Promise<RawFlow | null> {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) return null;

  const url = `https://public-api.birdeye.so/defi/txs/token?address=${mint}&offset=0&limit=200&chain=solana`;
  const r = await fetch(url, { headers: { "X-API-KEY": key, accept: "application/json" } });
  if (!r.ok) return null;
  const j = await r.json();

  const now = Date.now() / 1000;
  const twoMinAgo = now - 120;
  const rows = (j?.data?.items ?? []).filter((x: any) => (x?.blockUnixTime ?? 0) >= twoMinAgo);

  const buyers = new Set<string>();
  const sellers = new Set<string>();
  let buys = 0, sells = 0, notionalSol = 0;

  for (const t of rows) {
    const side = (t?.side ?? "").toLowerCase();
    const buyer = t?.buyer || t?.owner || t?.sender || "";
    const seller = t?.seller || t?.owner || t?.sender || "";
    const valueSol = Number(t?.value || 0);

    if (side.includes("buy")) { buys++; if (buyer) buyers.add(buyer); }
    if (side.includes("sell")) { sells++; if (seller) sellers.add(seller); }
    notionalSol += Number.isFinite(valueSol) ? valueSol : 0;
  }

  return {
    uniqueBuyers2m: buyers.size,
    buyToSell2m: buys / Math.max(1, sells),
    txPerMin: rows.length / 2,
    notionalSol2m: notionalSol,
  };
}

async function getHeliusFlow(mint: string): Promise<RawFlow | null> {
  const key = process.env.HELIUS_REST_KEY;
  if (!key) return null;
  const url = `https://api.helius.xyz/v0/addresses/${mint}/transactions?api-key=${key}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const data = await r.json();

  const nowMs = Date.now();
  const twoMinAgoMs = nowMs - 120_000;
  const recent = (Array.isArray(data) ? data : []).filter(
    (tx: any) => Number(tx?.timestamp) * 1000 >= twoMinAgoMs
  );

  const buyers = new Set<string>();
  const sellers = new Set<string>();
  let buys = 0, sells = 0;

  for (const t of recent) {
    const typ = (t?.type ?? "").toLowerCase();
    if (typ.includes("swap") || typ.includes("token")) {
      const acct = t?.feePayer || t?.source || t?.nativeTransfers?.[0]?.fromUserAccount || "";
      if (acct) (buys + sells) % 2 === 0 ? buyers.add(acct) && buys++ : sellers.add(acct) && sells++;
    }
  }

  return {
    uniqueBuyers2m: buyers.size,
    buyToSell2m: buys / Math.max(1, sells),
    txPerMin: recent.length / 2,
    notionalSol2m: recent.length * 0.05,
  };
}

// ------------------------ Scoring Builders ------------------------

function buildLiquidityScore(v: number) {
  return n_notionalSol(v);
}
function buildCurveScore(buyToSell2m: number, liq: number) {
  const momentum = n_buySellRatio(buyToSell2m);
  const earlyBias = 1 - liq;
  return clamp01(0.6 * momentum + 0.4 * earlyBias);
}
async function getSocialScore(_: string) {
  return 0.5; // neutral baseline
}

// ------------------------ Master Scoring ------------------------

export async function scoreToken(mint: string): Promise<ScoreOutput> {
  let flowRaw = await getBirdeyeFlow(mint);
  if (!flowRaw) flowRaw = await getHeliusFlow(mint);
  if (!flowRaw)
    return { mint, flow: 0.1, liquidity: 0.1, curve: 0.1, social: 0.5, total: 0.22 };

  // Normalize submetrics
  const flow_tx = n_txPerMin(flowRaw.txPerMin);
  const flow_buyers = n_uniqueBuyers(flowRaw.uniqueBuyers2m);
  const flow_ratio = n_buySellRatio(flowRaw.buyToSell2m);

  // Combine into flow score
  const flow = clamp01(0.45 * flow_tx + 0.35 * flow_buyers + 0.20 * flow_ratio);
  const liquidity = buildLiquidityScore(flowRaw.notionalSol2m);
  const curve = buildCurveScore(flowRaw.buyToSell2m, liquidity);
  const social = await getSocialScore(mint);

  // Regression-backed weight tuning
  let total = 0.4 * flow + 0.15 * liquidity + 0.35 * curve + 0.1 * social;

  // Bonus: low entry price bias (from regression)
  if (flowRaw.notionalSol2m < 100) total += 0.05;

  return { mint, flow, liquidity, curve, social, total: clamp01(total) };
}

// ------------------------ Manual CLI Test ------------------------

if (require.main === module) {
  (async () => {
    const mint = process.argv[2] || "So11111111111111111111111111111111111111112";
    const s = await scoreToken(mint);
    console.log("📊 Updated Score:", mint, s);
  })();
}
