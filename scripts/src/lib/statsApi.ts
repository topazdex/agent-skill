// Typed client for the Topaz Stats API (https://www.topazdex.com/api/stats).
// Read-only; no auth required for public endpoints.

const BASE_URL =
  process.env.TOPAZ_STATS_API_URL ?? "https://www.topazdex.com/api/stats";

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

export interface StatsApiMeta {
  chainId: number;
  generatedAt: string;
  snapshotAt: string;
  source: string[];
  cacheTtlSeconds: number;
}

export interface StatsApiOk<T> {
  ok: true;
  data: T;
  meta: StatsApiMeta;
}

export interface StatsApiError {
  ok: false;
  error: { code: string; message: string };
  meta: StatsApiMeta;
}

export type StatsApiResponse<T> = StatsApiOk<T> | StatsApiError;

// ---------------------------------------------------------------------------
// Shared field types
// ---------------------------------------------------------------------------

export interface PoolSnapshot {
  id: number;
  snapshotId: number;
  snapshotAt: string;
  poolAddress: string;
  poolType: "v2-volatile" | "v2-stable" | "v3-cl";
  token0Address: string;
  token1Address: string;
  token0Symbol: string;
  token1Symbol: string;
  tickSpacing: number | null;
  stable: boolean | null;
  fee: number;
  feeTier: number | null;
  customFee: boolean;
  dynamicFee: boolean;
  dynamicFeeCap: number | null;
  dynamicScalingFactor: string | null;
  tvlUsd: string;
  volume24hUsd: string;
  volume7dUsd: string;
  fees24hUsd: string;
  fees7dUsd: string;
  feeApr: string;
  /** Total gauge APR (%), denormalized from `gauge_snapshots.totalApr`. Null if no live gauge. */
  gaugeApr: string | null;
  createdAt?: string;
}

export interface GaugeSnapshot {
  id: number;
  snapshotId: number;
  snapshotAt: string;
  gaugeAddress: string;
  poolAddress: string;
  poolType: "v2-volatile" | "v2-stable" | "v3-cl";
  alive: boolean;
  stakedTvlUsd: string;
  rewardRateTopaz: string;
  emissionsAnnualizedUsd: string;
  emissionApr: string;
  feeApr: string;
  bribeApr: string | null;
  totalApr: string | null;
  totalVoteWeight: string;
  foundationVoteWeight: string;
  token0Symbol: string | null;
  token1Symbol: string | null;
  token0Address: string | null;
  token1Address: string | null;
  tvlUsd: string | null;
  createdAt?: string;
}

export interface VoteSnapshot {
  id: number;
  snapshotId: number;
  snapshotAt: string;
  epochStart: string;
  venftId: number;
  gaugeAddress: string;
  poolAddress: string;
  voteWeight: string;
  votePercent: string;
  totalGaugeVoteWeight: string;
}

export interface BribeEvent {
  id: number;
  txHash: string;
  logIndex: number;
  blockNumber: string;
  timestamp: string;
  epochStart: string;
  fromAddress: string;
  rewardContract: string;
  gaugeAddress: string;
  poolAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  amountRaw: string;
  amountDecimal: string;
  amountUsd: string;
  isFoundationFunded: boolean;
  createdAt?: string;
}

export interface KpiSnapshot {
  id: number;
  snapshotId: number;
  snapshotAt: string;
  epochStart: string;
  poolAddress: string;
  gaugeAddress: string;
  foundationVoteWeight: string;
  foundationVoteShare: string;
  externalVoteWeight: string;
  bribeCostUsd: string;
  emissionsDirectedUsd: string;
  tvlBeforeUsd: string | null;
  tvlAfterUsd: string | null;
  tvlDeltaUsd: string | null;
  volumeBeforeUsd: string | null;
  volumeAfterUsd: string | null;
  volumeDeltaUsd: string | null;
  feesBeforeUsd: string | null;
  feesAfterUsd: string | null;
  feesDeltaUsd: string | null;
  costPerTvlDeltaUsd: string | null;
  costPerVolumeDeltaUsd: string | null;
  costPerFeeDeltaUsd: string | null;
  roiEstimate: string | null;
  classification:
    | "scale"
    | "repeat"
    | "monitor"
    | "reduce"
    | "stop"
    | "insufficient_data";
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Per-endpoint data shapes
// ---------------------------------------------------------------------------

export interface ProtocolData {
  id: number;
  snapshotId: number;
  snapshotAt: string;
  tvlUsd: string;
  v2TvlUsd: string;
  v3TvlUsd: string;
  volume24hUsd: string;
  volume7dUsd: string;
  fees24hUsd: string;
  fees7dUsd: string;
  cumulativeVolumeUsd: string;
  cumulativeFeesUsd: string;
  poolCount: number;
  activeGaugeCount: number;
  topazPriceUsd: string;
  totalLockedTopaz: string;
  totalVetopazPower: string;
  currentEpochStart: string;
}

export interface PoolDetailData {
  current: PoolSnapshot | null;
  /** Up to 672 snapshots (~7 days at 15-min cadence). */
  history: PoolSnapshot[];
  /** Latest gauge snapshot for the pool, or null if the pool has no gauge. */
  gauge: GaugeSnapshot | null;
  /** Up to 672 gauge snapshots (~7 days). */
  gaugeHistory: GaugeSnapshot[];
}

export interface VeLock {
  tokenId: number;
  owner: string;
  ownedByFoundation: boolean;
  lockedAmount: string;
  votingPower: string;
  lockEnd: string | null;
  isPermanent: boolean;
}

export interface VeFoundation {
  wallet: string;
  venftIds: number[];
  activeVotingPower: string;
  /** Per-NFT lock details fetched live from BNB RPC; omitted if the RPC fetch failed. */
  locks?: VeLock[];
}

export interface VeData {
  totalLockedTopaz: string;
  totalVetopazPower: string;
  foundation: VeFoundation;
  currentEpochStart: string | null;
  /** @deprecated Use `foundation.wallet`. */
  foundationWallet: string;
  /** @deprecated Use `foundation.venftIds`. */
  foundationVeNftIds: number[];
  /** @deprecated Use `foundation.activeVotingPower`. */
  foundationVotingPowerActive: string;
}

export interface FoundationData {
  wallet: string;
  veNftIds: number[];
  votingPowerActive: string;
  currentEpochStart: string | null;
  activeVoteCount: number;
  activePoolCount: number;
  lifetimeBribeUsd: string;
  lifetimeBribeCount: number;
  recentBribeTotals: Array<{
    epochStart: string;
    totalUsd: string;
    count: number;
  }>;
}

export interface HealthData {
  healthy: boolean;
  stale: boolean;
  lastSuccessfulAt: string | null;
  lastSuccessfulId: number | null;
  lastAttemptStatus: "running" | "success" | "partial" | "failed" | null;
  minutesSinceLastSuccess: number | null;
  staleThresholdMinutes: number;
}

export interface TrackedPair {
  key: string;
  priority: number;
  tokens: string[];
}

export interface ConfigData {
  chainId: number;
  methodologyVersion: string;
  snapshotIntervalMinutes: number;
  foundation: {
    wallet: string;
    veNftIds: number[];
  };
  trackedPairs: TrackedPair[];
  competitors: { available: boolean };
  contracts: Record<string, string>;
  lastSuccessfulSnapshot: { id: number; snapshotAt: string } | null;
}

export interface LiveDynamicFeesData {
  fetchedAt: string;
  snapshotAt: string | null;
  cacheTtlSeconds: number;
  pools: Array<{
    poolAddress: string;
    token0Symbol: string;
    token1Symbol: string;
    tickSpacing: number | null;
    snapshotFee: number;
    liveFee: number | null;
    baseFee: number | null;
    maxFee: number | null;
    scalingFactor: string | null;
    customFee: boolean;
    dynamicFee: boolean;
    error?: string;
  }>;
}

export interface ProtocolHistoryPoint {
  snapshotAt: string;
  tvlUsd: string;
  v2TvlUsd: string;
  v3TvlUsd: string;
  volume24hUsd: string;
  fees24hUsd: string;
  topazPriceUsd: string;
}

export interface ProtocolDailyPoint {
  dayStartUtc: string;
  volumeUsd: string;
  feesUsd: string;
  /** `true` if this is the current (in-progress) UTC day. */
  partial: boolean;
}

export interface PoolDailyRow {
  id: number;
  poolAddress: string;
  poolType: "v2-volatile" | "v2-stable" | "v3-cl";
  dayStartUtc: string;
  volumeUsd: string;
  feesUsd: string;
  tvlUsdClose: string;
  txCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface GaugeDetailData {
  current: GaugeSnapshot | null;
  /** Up to 672 historical snapshots (~7 days at 15-min cadence). */
  history: GaugeSnapshot[];
}

export interface GaugeRewardRow {
  id: number;
  snapshotId: number;
  snapshotAt: string;
  epochStart: string;
  gaugeAddress: string;
  poolAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  kind: "bribe" | "fee";
  amountRaw: string;
  amountDecimal: string;
  amountUsd: string;
  createdAt: string;
}

export interface TokenSnapshot {
  id: number;
  snapshotId: number;
  snapshotAt: string;
  address: string;
  symbol: string;
  decimals: number;
  priceUsd: string;
  derivedEth: string | null;
  createdAt: string;
}

export interface TokenDetailData {
  current: TokenSnapshot | null;
  /** Up to 672 historical points (~7 days at 15-min cadence). */
  history: TokenSnapshot[];
}

export interface EpochTopGauge {
  gaugeAddress: string;
  poolAddress: string;
  token0Symbol: string | null;
  token1Symbol: string | null;
  voteWeight: string;
  bribesUsd: string;
}

export interface EpochSummary {
  epochStart: string;
  epochEnd: string;
  isCurrent: boolean;
  totalBribesUsd: string;
  bribeCount: number;
  foundationBribesUsd: string;
  totalVoteWeight: string;
  foundationVoteWeight: string;
  foundationVoteShare: string;
  gaugeCount: number;
  topGauges: EpochTopGauge[];
}

export interface EpochDetailData {
  epochStart: string;
  epochEnd: string;
  isCurrent: boolean;
  votes: VoteSnapshot[];
  bribes: BribeEvent[];
  kpis: KpiSnapshot[];
  totals: {
    totalBribesUsd: string;
    foundationBribesUsd: string;
    bribeCount: number;
    foundationVoteCount: number;
  };
}

export interface BribeTotal {
  epochStart: string;
  totalUsd: string;
  count: number;
}

export interface BribeMarketRow {
  gaugeAddress: string;
  poolAddress: string;
  poolType: string | null;
  token0Symbol: string | null;
  token1Symbol: string | null;
  epochStart: string;
  totalBribesUsd: string;
  totalFeesUsd: string;
  totalRewardUsd: string;
  bribes: Array<{ tokenSymbol: string; tokenAddress: string; amountUsd: string }>;
  voteWeight: string;
  /** `totalBribesUsd / (voteWeight / 1e18)`. */
  dollarPerVote: string;
}

// ---------------------------------------------------------------------------
// Query parameter types
// ---------------------------------------------------------------------------

export interface FetchPoolsParams {
  type?: "v2" | "v3" | "all";
  sort?: "tvl" | "volume24h" | "fees24h" | "apr" | "gaugeApr";
  limit?: number;
  /** Token-symbol pair, e.g. `"WBNB-USDT"` (case-insensitive, either order). */
  pair?: string;
  /** Filter to pools where this token address sits on either side. */
  token?: string;
  /** Drop pools below this TVL (USD). */
  minTvl?: number;
  /** Only pools whose gauge is alive and currently emitting TOPAZ. */
  incentivized?: boolean;
}

export interface FetchDaysParams {
  /** Lookback window, 1–365. */
  days?: number;
}

export interface FetchPoolBribesParams {
  limit?: number;
  epoch?: number;
  foundationOnly?: boolean;
}

export interface FetchGaugeRewardsParams {
  /** 1–200. */
  limit?: number;
}

export interface FetchTokensParams {
  /** 1–500. */
  limit?: number;
}

export interface FetchEpochsParams {
  /** 1–52. */
  limit?: number;
}

export interface FetchBribeMarketsParams {
  epoch?: number;
  minUsd?: number;
  limit?: number;
}

export interface FetchVotesParams {
  epoch?: number;
  venftId?: number;
  pool?: string;
  latestOnly?: boolean;
}

export interface FetchBribesParams {
  pool?: string;
  epoch?: number;
  foundationOnly?: boolean;
  limit?: number;
}

export interface FetchKpisParams {
  epoch?: number;
  pool?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------

export class StatsApiRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly meta: StatsApiMeta,
  ) {
    super(message);
    this.name = "StatsApiRequestError";
  }
}

async function fetchApi<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<StatsApiOk<T>> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString());
  const body = (await res.json()) as StatsApiResponse<T>;

  if (!body.ok) {
    throw new StatsApiRequestError(body.error.code, body.error.message, body.meta);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Endpoint wrappers
// ---------------------------------------------------------------------------

export async function fetchProtocol(): Promise<StatsApiOk<ProtocolData>> {
  return fetchApi<ProtocolData>("/protocol");
}

export async function fetchPools(
  params?: FetchPoolsParams,
): Promise<StatsApiOk<PoolSnapshot[]>> {
  return fetchApi<PoolSnapshot[]>("/pools", params as Record<string, string | number | boolean | undefined>);
}

export async function fetchPool(
  poolAddress: string,
): Promise<StatsApiOk<PoolDetailData>> {
  return fetchApi<PoolDetailData>(`/pools/${poolAddress.toLowerCase()}`);
}

export async function fetchGauges(): Promise<StatsApiOk<GaugeSnapshot[]>> {
  return fetchApi<GaugeSnapshot[]>("/gauges");
}

export async function fetchVe(): Promise<StatsApiOk<VeData>> {
  return fetchApi<VeData>("/ve");
}

export async function fetchFoundation(): Promise<StatsApiOk<FoundationData>> {
  return fetchApi<FoundationData>("/foundation");
}

export async function fetchFoundationVotes(
  params?: FetchVotesParams,
): Promise<StatsApiOk<VoteSnapshot[]>> {
  return fetchApi<VoteSnapshot[]>(
    "/foundation/votes",
    params as Record<string, string | number | boolean | undefined>,
  );
}

export async function fetchFoundationBribes(
  params?: Omit<FetchBribesParams, "foundationOnly">,
): Promise<StatsApiOk<BribeEvent[]>> {
  return fetchApi<BribeEvent[]>(
    "/foundation/bribes",
    params as Record<string, string | number | boolean | undefined>,
  );
}

export async function fetchFoundationKpis(
  params?: FetchKpisParams,
): Promise<StatsApiOk<KpiSnapshot[]>> {
  return fetchApi<KpiSnapshot[]>(
    "/foundation/kpis",
    params as Record<string, string | number | boolean | undefined>,
  );
}

export async function fetchVotes(
  params?: FetchVotesParams,
): Promise<StatsApiOk<VoteSnapshot[]>> {
  return fetchApi<VoteSnapshot[]>(
    "/votes",
    params as Record<string, string | number | boolean | undefined>,
  );
}

export async function fetchBribes(
  params?: FetchBribesParams,
): Promise<StatsApiOk<BribeEvent[]>> {
  return fetchApi<BribeEvent[]>(
    "/bribes",
    params as Record<string, string | number | boolean | undefined>,
  );
}

export async function fetchDynamicFees(): Promise<StatsApiOk<PoolSnapshot[]>> {
  return fetchApi<PoolSnapshot[]>("/dynamic-fees");
}

export async function fetchLiveDynamicFees(): Promise<
  StatsApiOk<LiveDynamicFeesData>
> {
  return fetchApi<LiveDynamicFeesData>("/live/dynamic-fees");
}

export async function fetchHealth(): Promise<StatsApiOk<HealthData>> {
  return fetchApi<HealthData>("/health");
}

export async function fetchConfig(): Promise<StatsApiOk<ConfigData>> {
  return fetchApi<ConfigData>("/config");
}

// ---------------------------------------------------------------------------
// Historical & time-series
// ---------------------------------------------------------------------------

export async function fetchProtocolHistory(
  params?: FetchDaysParams,
): Promise<StatsApiOk<ProtocolHistoryPoint[]>> {
  return fetchApi<ProtocolHistoryPoint[]>(
    "/protocol/history",
    params as Record<string, number | undefined>,
  );
}

export async function fetchProtocolDaily(
  params?: FetchDaysParams,
): Promise<StatsApiOk<ProtocolDailyPoint[]>> {
  return fetchApi<ProtocolDailyPoint[]>(
    "/protocol/daily",
    params as Record<string, number | undefined>,
  );
}

export async function fetchPoolDaily(
  poolAddress: string,
  params?: FetchDaysParams,
): Promise<StatsApiOk<PoolDailyRow[]>> {
  return fetchApi<PoolDailyRow[]>(
    `/pools/${poolAddress.toLowerCase()}/daily`,
    params as Record<string, number | undefined>,
  );
}

export async function fetchPoolBribes(
  poolAddress: string,
  params?: FetchPoolBribesParams,
): Promise<StatsApiOk<BribeEvent[]>> {
  return fetchApi<BribeEvent[]>(
    `/pools/${poolAddress.toLowerCase()}/bribes`,
    params as Record<string, string | number | boolean | undefined>,
  );
}

// ---------------------------------------------------------------------------
// Per-gauge detail
// ---------------------------------------------------------------------------

export async function fetchGauge(
  gaugeAddress: string,
): Promise<StatsApiOk<GaugeDetailData>> {
  return fetchApi<GaugeDetailData>(`/gauges/${gaugeAddress.toLowerCase()}`);
}

export async function fetchGaugeBribes(
  gaugeAddress: string,
  params?: FetchPoolBribesParams,
): Promise<StatsApiOk<BribeEvent[]>> {
  return fetchApi<BribeEvent[]>(
    `/gauges/${gaugeAddress.toLowerCase()}/bribes`,
    params as Record<string, string | number | boolean | undefined>,
  );
}

export async function fetchGaugeKpis(
  gaugeAddress: string,
  params?: FetchKpisParams,
): Promise<StatsApiOk<KpiSnapshot[]>> {
  return fetchApi<KpiSnapshot[]>(
    `/gauges/${gaugeAddress.toLowerCase()}/kpis`,
    params as Record<string, string | number | boolean | undefined>,
  );
}

export async function fetchGaugeRewards(
  gaugeAddress: string,
  params?: FetchGaugeRewardsParams,
): Promise<StatsApiOk<GaugeRewardRow[]>> {
  return fetchApi<GaugeRewardRow[]>(
    `/gauges/${gaugeAddress.toLowerCase()}/rewards`,
    params as Record<string, number | undefined>,
  );
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export async function fetchTokens(
  params?: FetchTokensParams,
): Promise<StatsApiOk<TokenSnapshot[]>> {
  return fetchApi<TokenSnapshot[]>(
    "/tokens",
    params as Record<string, number | undefined>,
  );
}

export async function fetchToken(
  address: string,
): Promise<StatsApiOk<TokenDetailData>> {
  return fetchApi<TokenDetailData>(`/tokens/${address.toLowerCase()}`);
}

// ---------------------------------------------------------------------------
// Epochs & bribe markets
// ---------------------------------------------------------------------------

export async function fetchEpochs(
  params?: FetchEpochsParams,
): Promise<StatsApiOk<EpochSummary[]>> {
  return fetchApi<EpochSummary[]>(
    "/epochs",
    params as Record<string, number | undefined>,
  );
}

export async function fetchEpoch(
  epochStart: number,
): Promise<StatsApiOk<EpochDetailData>> {
  return fetchApi<EpochDetailData>(`/epochs/${epochStart}`);
}

export async function fetchBribeTotals(): Promise<StatsApiOk<BribeTotal[]>> {
  return fetchApi<BribeTotal[]>("/bribes/totals");
}

export async function fetchBribeMarkets(
  params?: FetchBribeMarketsParams,
): Promise<StatsApiOk<BribeMarketRow[]>> {
  return fetchApi<BribeMarketRow[]>(
    "/markets/bribes",
    params as Record<string, number | undefined>,
  );
}

export const STATS_API_BASE_URL = BASE_URL;
