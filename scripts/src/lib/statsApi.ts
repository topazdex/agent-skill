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
  tvlUsd: string | null;
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
  history: PoolSnapshot[];
}

export interface VeData {
  totalLockedTopaz: string;
  totalVetopazPower: string;
  foundationWallet: string;
  foundationVeNftIds: number[];
  foundationVotingPowerActive: string;
  currentEpochStart: string | null;
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

// ---------------------------------------------------------------------------
// Query parameter types
// ---------------------------------------------------------------------------

export interface FetchPoolsParams {
  type?: "v2" | "v3" | "all";
  sort?: "tvl" | "volume24h" | "fees24h" | "apr";
  limit?: number;
  pair?: string;
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

export const STATS_API_BASE_URL = BASE_URL;
