// The token radar's model: snapshot-derived token/category medians score every board row.
// The board keeps every watchlist slug and fills the remaining slots with the highest-scoring rankable
// pre-token protocols. Live-token protocols are shown separately.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, also described by the dashboard. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_weight: number;
  breadth_extra_chains_cap: number;
  category_min_samples: number;
  fallback_category_multiple: number;
  reference_date: string;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1460,
  unknown_age_days: 365,
  breadth_weight: 0.05,
  breadth_extra_chains_cap: 4,
  category_min_samples: 5,
  fallback_category_multiple: 0.25,
  reference_date: '2026-11-14',
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many additional rankable pre-token protocols fill the board beyond the watchlist. */
export const EARLY_ROWS = 220;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    categoryMultiple: number;
    growth_pct: number | null;
    growthMult: number;
    maturityMult: number;
    breadthMult: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  watchlist: boolean;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  categoryMultiple: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function dateMillis(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = dateMillis(asOf);
  const b = dateMillis(listedAt);
  if (a === null || b === null) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The model components and implied value for one protocol. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  categoryMultiple = model.fallback_category_multiple,
): { implied: number; growthPct: number | null; growthMult: number; maturityMult: number; breadthMult: number; categoryMultiple: number; age: number | null } {
  const age = ageDays(model.reference_date || asOf, protocol.listed_at);
  const growthPct = protocol.change_7d === null ? null : Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0)));
  const growthMult = growthPct === null ? 1 : 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + Math.min(protocol.chains.length - 1, model.breadth_extra_chains_cap) * model.breadth_weight;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * categoryMultiple * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, categoryMultiple, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Median of a non-empty numeric sample. */
function median(values: number[]): number {
  const ordered = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1]! + ordered[middle]!) / 2 : ordered[middle]!;
}

/** Category market-cap/TVL medians from this snapshot, with global and fixed fallbacks. */
function categoryMultiples(snapshot: Snapshot, model: ModelConstants): Map<string | null, number> {
  const global: number[] = [];
  const categories = new Map<string | null, number[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio)) continue;
    global.push(ratio);
    const values = categories.get(p.category) ?? [];
    values.push(ratio);
    categories.set(p.category, values);
  }
  const globalMedian = global.length > 0 ? median(global) : model.fallback_category_multiple;
  const result = new Map<string | null, number>();
  for (const p of snapshot.protocols) {
    if (result.has(p.category)) continue;
    const values = categories.get(p.category) ?? [];
    result.set(p.category, values.length >= model.category_min_samples ? median(values) : globalMedian);
  }
  return result;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const multiples = categoryMultiples(snapshot, model);
  const score = (p: SnapshotProtocol) =>
    impliedValue(p, snapshot.as_of, model, multiples.get(p.category) ?? model.fallback_category_multiple);
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .map((p) => ({ p, result: score(p) }))
    .sort((a, b) => b.result.implied - a.result.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const { p } of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    return { p, ...score(p) };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      categoryMultiple: s.categoryMultiple,
      growth_pct: s.growthPct,
      growthMult: s.growthMult,
      maturityMult: s.maturityMult,
      breadthMult: s.breadthMult,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  const suffix = ` Cost: ${step.cost}. Time: ${step.time}.`;
  const maxTextLength = 600 - suffix.length;
  const text = step.text.length > maxTextLength ? `${step.text.slice(0, maxTextLength - 3)}...` : step.text;
  const result = `${text}${suffix}`;
  return result.length < 20 ? `${result} Review the protocol's own page.` : result;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

interface GasProfile {
  simple: number;
  complex: number;
  bridge: number;
}

/** Approximate per-transaction fees for the protocol's primary chain. */
function gasProfile(chain: string): GasProfile {
  const c = chain.toLowerCase();
  if (c === 'ethereum' || c === 'ethereum mainnet') return { simple: 8, complex: 16, bridge: 28 };
  if (c === 'solana') return { simple: 0.01, complex: 0.03, bridge: 0.1 };
  if (/\b(base|arbitrum|optimism|op mainnet|polygon|zksync|linea|scroll|mantle|blast|mode)\b/.test(c)) {
    return { simple: 0.05, complex: 0.15, bridge: 0.6 };
  }
  return { simple: 0.5, complex: 1.5, bridge: 4 };
}

function usdCost(amount: number): string {
  return `about US$${amount.toFixed(2)}`;
}

interface CategoryPlaybook {
  firstAction: string;
  followUp: string;
  exitAction: string;
}

/** Category-specific actions for a conservative, repeatable farm plan. */
function playbookFor(p: SnapshotProtocol, capital: number, chain: string): CategoryPlaybook {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      firstAction: `Supply US$${capital} of USDC to ${name} on ${chain}; do not borrow for this test.`,
      followUp: `Check the supplied balance and collateral rules in ${name}; leave borrowing disabled.`,
      exitAction: `Withdraw the US$${capital} supply from ${name} on ${chain} and verify the wallet balance.`,
    };
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) {
    return {
      firstAction: `Add US$${capital} of the pool's two assets to ${name} on ${chain} and save the LP receipt.`,
      followUp: `Check the LP balance and fee history in ${name}; avoid leveraged positions.`,
      exitAction: `Remove the US$${capital} liquidity position from ${name} on ${chain} and verify both assets.`,
    };
  }
  if (c.includes('bridge')) {
    return {
      firstAction: `Bridge US$${capital} of USDC through ${name} to ${chain}; confirm the destination before signing.`,
      followUp: `Verify the bridge receipt and destination balance for the US$${capital} transfer.`,
      exitAction: `Bridge the US$${capital} balance back through ${name} and verify receipt on the source chain.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      firstAction: `Stake US$${capital} of the chain asset through ${name} on ${chain} and save the receipt.`,
      followUp: `Check the staking receipt and unbonding period in ${name}; do not restake borrowed funds.`,
      exitAction: `Request unstaking of the US$${capital} position through ${name} and verify the unlock date.`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative')) {
    return {
      firstAction: `Deposit US$${capital} of USDC to ${name} on ${chain}; keep it as unleveraged test margin.`,
      followUp: `Review the margin and liquidation settings in ${name}; do not open a leveraged position.`,
      exitAction: `Withdraw the US$${capital} test margin from ${name} and verify no position remains open.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      firstAction: `Fund ${name} with US$${capital} on ${chain} and place only a small test position.`,
      followUp: `Check the position status and settlement rules for the US$${capital} test in ${name}.`,
      exitAction: `Close or settle the test position in ${name} and withdraw the remaining US$${capital} balance.`,
    };
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return {
      firstAction: `Deposit US$${capital} into a ${name} vault on ${chain} and save the share receipt.`,
      followUp: `Review the vault holdings and withdrawal terms for the US$${capital} deposit in ${name}.`,
      exitAction: `Redeem the ${name} vault shares for the US$${capital} position and verify the proceeds.`,
    };
  }
  if (c.includes('stable')) {
    return {
      firstAction: `Mint or deposit US$${capital} of the stable asset through ${name} on ${chain}.`,
      followUp: `Check the minted balance and redemption terms for the US$${capital} position in ${name}.`,
      exitAction: `Redeem the US$${capital} stable-asset position through ${name} and verify the USDC balance.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      firstAction: `If eligible, invest US$${capital} in ${name}'s listed yield asset on ${chain}; check its terms first.`,
      followUp: `Review the US$${capital} asset's eligibility, lockup and issuer disclosures in ${name}.`,
      exitAction: `Request redemption of the US$${capital} ${name} position and note any issuer settlement delay.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      firstAction: `Quote US$${capital} of cover from ${name} on ${chain}; buy only if the policy terms fit.`,
      followUp: `Review the policy coverage and expiry date in ${name}; keep the policy receipt.`,
      exitAction: `Check the ${name} policy's cancellation or expiry terms and record any refund due.`,
    };
  }
  return {
    firstAction: `Make one US$${capital} deposit in ${name} on ${chain} and save the transaction receipt.`,
    followUp: `Verify the US$${capital} position and its withdrawal terms in ${name}.`,
    exitAction: `Withdraw the US$${capital} test position from ${name} on ${chain} and verify receipt.`,
  };
}

/**
 * A protocol's farm plan: seven concrete steps derived from category, primary chain and TVL.
 */
export function farmSteps(p: SnapshotProtocol): FarmStep[] {
  const chain = p.chains[0] ?? 'its main chain';
  const gas = gasProfile(chain);
  const capital = capitalFor(p);
  const plan = playbookFor(p, capital, chain);
  const isBridge = (p.category ?? '').toLowerCase().includes('bridge');
  const actionGas = isBridge ? gas.bridge : gas.complex;
  return [
    {
      text: `Open ${p.name}'s official app on ${chain}, verify the URL and read the asset and exit terms before connecting.`,
      cost: 'US$0.00; no on-chain transaction',
      time: '5 minutes',
    },
    {
      text: plan.firstAction,
      cost: `US$${capital} capital plus estimated gas ${usdCost(actionGas)}`,
      time: '10 minutes to complete and verify',
    },
    {
      text: plan.followUp,
      cost: `US$0.00 capital; estimated gas ${usdCost(gas.simple)} if an on-chain check is needed`,
      time: '5 minutes',
    },
    {
      text: `Keep the US$${capital} position open for 7 days, check it once daily and stop if the position or terms change.`,
      cost: `US$${capital} remains deployed; US$0.00 gas for monitoring`,
      time: '7 days; 2 minutes each day',
    },
    {
      text: `Check ${p.name}'s official rewards page and record any points; do not pay an unsolicited claim fee.`,
      cost: 'US$0.00 to check; no claim transaction',
      time: '5 minutes',
    },
    {
      text: plan.exitAction,
      cost: `estimated exit gas ${usdCost(isBridge ? gas.bridge * 2 : gas.complex)}; network fees can vary`,
      time: '10 minutes to submit and verify',
    },
    {
      text: `Log the deposit, follow-up, exit transaction IDs and actual fees, then compare them with the position returned.`,
      cost: 'US$0.00; use a local note',
      time: '3 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, including the model and farm plan. */
export function radarRow(row: BoardRow, watchlist: string[]): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    watchlist: watchlist.includes(row.slug),
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    categoryMultiple: row.model.categoryMultiple,
    growthMult: row.model.growthMult,
    maturityMult: row.model.maturityMult,
    breadthMult: row.model.breadthMult,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((row) => radarRow(row, snapshot.watchlist)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 6 || steps.length > 7) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
