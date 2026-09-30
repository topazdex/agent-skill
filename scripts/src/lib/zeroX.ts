// 0x AllowanceHolder swap legs for the single-token zaps (CLZap and AutoManageZap),
// fetched through the Topaz website's public 0x proxy. The proxy adds Topaz's
// 0.6% integrator fee and 0x adds its own; both are already netted out of
// buyAmount / minBuyAmount. A quote is untrusted input: validateFirmQuote checks
// it against the request, the canonical AllowanceHolder and the live Settler
// registry before its calldata is used. See references/liquidity-zaps.md.

import { Contract, Interface, getAddress } from "ethers";
import { provider } from "./client.js";

export const ZEROX_PROXY_URL = process.env.TOPAZ_ZEROX_PROXY_URL || "https://www.topazdex.com/api/0x";
export const ALLOWANCE_HOLDER = "0x0000000000001fF3684f28c67538d4D072C22734";
export const SETTLER_REGISTRY = "0x00000000000004533Fe15556B1E086BB1A72cEae";
/** Settler registry feature id for AllowanceHolder-routed takers. */
const SETTLER_FEATURE_ID = 2;

/** Upper bounds on disclosed fees; Topaz charges 60 bps and 0x 15 bps today. */
export const FEE_CAPS_BPS: Record<string, bigint> = { integratorFee: 61n, zeroExFee: 50n };

const allowanceHolder = new Interface([
  "function exec(address operator, address token, uint256 amount, address target, bytes data) payable returns (bytes)",
]);
const registryAbi = [
  "function ownerOf(uint256 featureId) view returns (address)",
  "function prev(uint128 featureId) view returns (address)",
];

interface ZeroXFee {
  amount: string;
  token: string;
  type?: string;
}

export interface ZeroXQuote {
  liquidityAvailable: boolean;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  minBuyAmount?: string;
  allowanceTarget?: string;
  transaction?: { to: string; data: string; value: string };
  issues?: {
    simulationIncomplete?: boolean;
    invalidSourcesPassed?: string[];
    allowance?: { spender: string } | null;
  };
  tokenMetadata?: Record<string, { buyTaxBps?: string | null; sellTaxBps?: string | null; transferTaxBps?: string | null }>;
  fees?: Record<string, ZeroXFee | ZeroXFee[] | null>;
  zid?: string;
}

export interface SwapLegFee {
  kind: string;
  token: string;
  amount: bigint;
}

export interface SwapLeg {
  sellToken: string;
  buyToken: string;
  sellAmount: bigint;
  buyAmount: bigint;
  minBuyAmount: bigint;
  allowanceHolderCalldata: string;
  fees: SwapLegFee[];
  zid: string | null;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function callProxy(query: Record<string, string>): Promise<ZeroXQuote> {
  const url = new URL(ZEROX_PROXY_URL);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  let res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  for (let attempt = 1; res.status === 429 && attempt <= 3; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  }
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`0x quote unavailable (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const { message, data } = body as { message?: string; data?: { details?: Array<{ field?: string; reason?: string }> } };
    const details = (data?.details ?? []).map((d) => `${d.field}: ${d.reason}`).join("; ");
    throw new Error(`0x quote rejected (HTTP ${res.status}): ${message ?? res.statusText}${details ? ` (${details})` : ""}`);
  }
  return body as ZeroXQuote;
}

/** Indicative output for sizing a split. Never executable and never a minimum. */
export async function indicativeBuyAmount(
  chainId: number, sellToken: string, buyToken: string, sellAmount: bigint, taker: string,
): Promise<bigint> {
  const q = await callProxy({
    path: "swap/allowance-holder/price",
    chainId: String(chainId),
    sellToken,
    buyToken,
    sellAmount: sellAmount.toString(),
    taker,
  });
  if (q.liquidityAvailable !== true) throw new Error(`0x has no liquidity for this swap on chain ${chainId}`);
  const out = BigInt(q.buyAmount);
  if (out <= 0n) throw new Error("0x returned no output for this swap");
  return out;
}

/**
 * Current and previous AllowanceHolder Settlers; a quote must target one of them.
 * `ownerOf` is the trust anchor and its failure is fatal. `prev` reverts on a chain
 * that never had an earlier Settler (Arc), which means there is no previous one.
 */
export async function acceptedSettlers(chainId: number): Promise<[string, string | null]> {
  const registry = new Contract(SETTLER_REGISTRY, registryAbi, provider(chainId));
  const [current, previous] = await Promise.all([
    registry.ownerOf(SETTLER_FEATURE_ID) as Promise<string>,
    (registry.prev(SETTLER_FEATURE_ID) as Promise<string>).then(
      (address) => address,
      () => null,
    ),
  ]);
  return [current, previous];
}

/**
 * Firm quote whose taker and recipient are the zap contract. `txOrigin` is the
 * wallet that will submit the zap. Call once per leg, right before building.
 */
export async function firmSwapLeg(input: {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: bigint;
  zap: string;
  txOrigin: string;
  slippageBps: number;
}): Promise<SwapLeg> {
  const { chainId, sellToken, buyToken, sellAmount, zap } = input;
  const [quote, [currentSettler, previousSettler]] = await Promise.all([
    callProxy({
      path: "swap/allowance-holder/quote",
      chainId: String(chainId),
      sellToken,
      buyToken,
      sellAmount: sellAmount.toString(),
      taker: zap,
      recipient: zap,
      txOrigin: input.txOrigin,
      slippageBps: String(input.slippageBps),
    }),
    acceptedSettlers(chainId),
  ]);
  return validateFirmQuote(quote, { sellToken, buyToken, sellAmount, currentSettler, previousSettler });
}

/**
 * Fees are charged in whichever of the two tokens 0x selects, so each one is
 * capped against the gross amount of its own token: the sell amount, or the
 * net buy amount plus every buy-token fee.
 */
function validateFees(q: ZeroXQuote, sellToken: string, buyToken: string, sellAmount: bigint): SwapLegFee[] {
  if (!q.fees || typeof q.fees !== "object") throw new Error("0x quote is missing fee metadata");
  const fees: SwapLegFee[] = [];
  for (const [kind, value] of Object.entries(q.fees)) {
    // integratorFees repeats integratorFee as a list.
    if (value === null || kind === "integratorFees") continue;
    for (const fee of Array.isArray(value) ? value : [value]) {
      const amount = BigInt(fee.amount);
      if (amount === 0n) continue;
      if (!same(fee.token, sellToken) && !same(fee.token, buyToken)) throw new Error(`0x ${kind} is charged in an unrelated token ${fee.token}`);
      fees.push({ kind, token: getAddress(fee.token), amount });
    }
  }
  const grossBuy = BigInt(q.buyAmount) + fees.filter((f) => same(f.token, buyToken)).reduce((sum, f) => sum + f.amount, 0n);
  for (const fee of fees) {
    const cap = FEE_CAPS_BPS[fee.kind];
    const gross = same(fee.token, sellToken) ? sellAmount : grossBuy;
    if (cap === undefined || fee.amount * 10_000n > gross * cap) {
      throw new Error(`Unexpected 0x ${fee.kind} of ${fee.amount} on ${fee.token}`);
    }
  }
  return fees;
}

/** Trust-boundary checks on a firm quote (ported from cl-zap `validateFirmQuote`). */
export function validateFirmQuote(
  q: ZeroXQuote,
  ctx: { sellToken: string; buyToken: string; sellAmount: bigint; currentSettler: string; previousSettler: string | null },
): SwapLeg {
  const { sellToken, buyToken, sellAmount, currentSettler, previousSettler } = ctx;
  if (
    q.liquidityAvailable !== true || !same(q.sellToken, sellToken) || !same(q.buyToken, buyToken)
    || BigInt(q.sellAmount) !== sellAmount || !q.minBuyAmount || BigInt(q.minBuyAmount) <= 0n
    || BigInt(q.buyAmount) < BigInt(q.minBuyAmount)
  ) {
    throw new Error("0x quote tokens, amounts or liquidity do not match the request");
  }
  const tx = q.transaction;
  if (
    !tx || !same(tx.to, ALLOWANCE_HOLDER) || !q.allowanceTarget || !same(q.allowanceTarget, ALLOWANCE_HOLDER)
    || BigInt(tx.value) !== 0n || (q.issues?.allowance && !same(q.issues.allowance.spender, ALLOWANCE_HOLDER))
  ) {
    throw new Error("0x quote uses an unexpected entry point, spender or native value");
  }
  if (q.issues?.simulationIncomplete !== false || (q.issues.invalidSourcesPassed ?? []).length !== 0) {
    throw new Error("0x quote simulation is incomplete or used invalid liquidity sources");
  }
  for (const meta of Object.values(q.tokenMetadata ?? {})) {
    for (const bps of [meta.buyTaxBps, meta.sellTaxBps, meta.transferTaxBps]) {
      if (bps !== undefined && bps !== null && BigInt(bps) !== 0n) throw new Error("Taxed tokens are not supported by the zaps");
    }
  }
  const fees = validateFees(q, sellToken, buyToken, sellAmount);

  const [operator, token, amount, target, nested] = allowanceHolder.decodeFunctionData("exec", tx.data) as unknown as [
    string, string, bigint, string, string,
  ];
  const isZero = (address: string) => /^0x0{40}$/i.test(address);
  const knownSettler = same(target, currentSettler) || (previousSettler !== null && !isZero(previousSettler) && same(target, previousSettler));
  if (
    isZero(currentSettler) || isZero(target) || !same(operator, target) || !same(token, sellToken) || amount !== sellAmount
    || nested.length < 22 || !knownSettler
  ) {
    throw new Error("0x quote has an invalid AllowanceHolder envelope or an unregistered Settler");
  }

  return {
    sellToken: getAddress(sellToken),
    buyToken: getAddress(buyToken),
    sellAmount,
    buyAmount: BigInt(q.buyAmount),
    minBuyAmount: BigInt(q.minBuyAmount),
    allowanceHolderCalldata: tx.data,
    fees,
    zid: q.zid ?? null,
  };
}

/** How much of the target one unit of each pool token fills; null when the target takes none of it. */
export type Capacity = (amount0: bigint, amount1: bigint) => [bigint | null, bigint | null];

const SCALE = 10n ** 18n;

/**
 * Split `amountIn` between buying token0 and token1 so the target (a CL range or a
 * vault ratio) is filled with both. Each side's capacity is linear in its amount,
 * so one indicative rate per bought token gives the split in closed form:
 *   x = A·c1·out1·in0 / (c0·out0·in1 + c1·out1·in0)
 * At most two price requests, never an iterative search against the rate-limited
 * proxy. Firm quotes, not this estimate, set every minimum.
 */
export async function findSplit(opts: {
  input: string;
  token0: string;
  token1: string;
  amountIn: bigint;
  capacity: Capacity;
  quote: (buyToken: string, sellAmount: bigint) => Promise<bigint>;
}): Promise<{ toToken0: bigint; toToken1: bigint }> {
  const { input, token0, token1, amountIn, capacity, quote } = opts;
  const c0 = capacity(SCALE, 0n)[0];
  const c1 = capacity(0n, SCALE)[1];
  if (c0 === null && c1 === null) throw new Error("The target accepts neither token at the current price");
  if (c1 === null || c1 === 0n) return { toToken0: amountIn, toToken1: 0n };
  if (c0 === null || c0 === 0n) return { toToken0: 0n, toToken1: amountIn };
  const sample = amountIn / 2n > 0n ? amountIn / 2n : amountIn;
  const rate = async (buy: string): Promise<[bigint, bigint]> =>
    same(buy, input) ? [sample, sample] : [await quote(buy, sample), sample];
  const [[out0, in0], [out1, in1]] = await Promise.all([rate(token0), rate(token1)]);
  const w1 = c1 * out1 * in0;
  const w0 = c0 * out0 * in1;
  const toToken0 = (amountIn * w1) / (w0 + w1);
  return { toToken0, toToken1: amountIn - toToken0 };
}
