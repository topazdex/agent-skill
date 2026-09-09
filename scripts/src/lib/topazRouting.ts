/** Shared with topaz-agent-service and agent-skill. Keep the wire validation in sync. */
export const TOPAZ_ROUTING_URL = "https://quote.topazdex.com";
export const TOPAZ_UNIVERSAL_ROUTER =
  "0x691e6171e0a434FfE5C9f1759621D05b9efcF6A6";
export const TOPAZ_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const TOPAZ_WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
export const MAX_PERMIT2_AMOUNT = (1n << 160n) - 1n;

export interface TopazHop {
  protocol: "cl" | "v2-volatile" | "v2-stable";
  address: string;
  tokenIn: string;
  tokenOut: string;
  tickSpacing?: number;
}
export interface TopazRoute {
  protocol: "CL" | "V2" | "MIXED";
  percent: number;
  amountIn: string;
  amountOut: string;
  hops: TopazHop[];
}
export interface TopazQuote {
  blockNumber: number;
  tradeType: "exactIn";
  amount: string;
  quote: string;
  minimumAmountOut: string;
  slippageBips: number;
  routes: TopazRoute[];
}
export interface TopazQuoteRequest {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  slippageBps?: number;
  recipient?: string;
  deadlineSeconds?: number;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Topaz quote object");
  return value as Record<string, unknown>;
}
function address(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^0x[\da-fA-F]{40}$/.test(value) ||
    /^0x0{40}$/i.test(value)
  ) {
    throw new Error("Invalid Topaz route address");
  }
  return value;
}
function uint(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{1,78}$/.test(value) ||
    BigInt(value) > (1n << 256n) - 1n
  ) {
    throw new Error("Invalid Topaz quote amount");
  }
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error("Invalid Topaz quote number");
  }
  return value;
}
export function wrappedTopazToken(token: string): string {
  return token.toUpperCase() === "BNB" ? TOPAZ_WBNB : address(token);
}

/** Treat the HTTP response as untrusted route data; never execute its opaque calldata. */
export function validateTopazQuote(
  value: unknown,
  request: TopazQuoteRequest,
): TopazQuote {
  const q = record(value);
  const input = wrappedTopazToken(request.tokenIn).toLowerCase();
  const output = wrappedTopazToken(request.tokenOut).toLowerCase();
  const amount = uint(q.amount);
  const quote = uint(q.quote);
  const minimumAmountOut = uint(q.minimumAmountOut);
  const slippageBips = integer(q.slippageBips, 1, 500);
  if (
    q.tradeType !== "exactIn" ||
    BigInt(amount) !== request.amountIn ||
    slippageBips !== (request.slippageBps ?? 100)
  ) {
    throw new Error("Topaz quote does not match the requested trade");
  }
  if (
    BigInt(quote) === 0n ||
    BigInt(minimumAmountOut) === 0n ||
    BigInt(minimumAmountOut) > BigInt(quote) ||
    BigInt(minimumAmountOut) <
      (BigInt(quote) * BigInt(10_000 - slippageBips)) / 10_000n
  ) {
    throw new Error("Topaz quote has an invalid minimum output");
  }
  if (!Array.isArray(q.routes) || q.routes.length === 0 || q.routes.length > 8)
    throw new Error("Invalid Topaz routes");
  const routes: TopazRoute[] = q.routes.map((raw) => {
    const r = record(raw);
    if (r.protocol !== "CL" && r.protocol !== "V2" && r.protocol !== "MIXED")
      throw new Error("Invalid Topaz protocol");
    if (!Array.isArray(r.hops) || r.hops.length === 0 || r.hops.length > 8)
      throw new Error("Invalid Topaz hops");
    let previous = input;
    const seen = new Set([input]);
    const hops: TopazHop[] = r.hops.map((rawHop) => {
      const h = record(rawHop);
      if (
        h.protocol !== "cl" &&
        h.protocol !== "v2-stable" &&
        h.protocol !== "v2-volatile"
      )
        throw new Error("Invalid Topaz hop protocol");
      const tokenIn = address(h.tokenIn);
      const tokenOut = address(h.tokenOut);
      if (
        tokenIn.toLowerCase() !== previous ||
        seen.has(tokenOut.toLowerCase())
      )
        throw new Error("Disconnected or cyclic Topaz route");
      previous = tokenOut.toLowerCase();
      seen.add(previous);
      return {
        protocol: h.protocol,
        address: address(h.address),
        tokenIn,
        tokenOut,
        ...(h.protocol === "cl"
          ? { tickSpacing: integer(h.tickSpacing, 1, 8_388_607) }
          : {}),
      };
    });
    if (previous !== output)
      throw new Error("Topaz route has the wrong output token");
    const amountIn = uint(r.amountIn);
    const amountOut = uint(r.amountOut);
    if (BigInt(amountIn) === 0n || BigInt(amountOut) === 0n)
      throw new Error("Empty Topaz split");
    return {
      protocol: r.protocol,
      percent: integer(r.percent, 1, 100),
      amountIn,
      amountOut,
      hops,
    };
  });
  if (
    routes.reduce((sum, r) => sum + BigInt(r.amountIn), 0n) !==
      BigInt(amount) ||
    routes.reduce((sum, r) => sum + BigInt(r.amountOut), 0n) !==
      BigInt(quote) ||
    routes.reduce((sum, r) => sum + r.percent, 0) !== 100
  )
    throw new Error("Topaz split totals do not match the quote");
  return {
    blockNumber: integer(q.blockNumber, 1, Number.MAX_SAFE_INTEGER),
    tradeType: "exactIn",
    amount,
    quote,
    minimumAmountOut,
    slippageBips,
    routes,
  };
}

export async function fetchTopazQuote(
  request: TopazQuoteRequest,
): Promise<TopazQuote> {
  const input = wrappedTopazToken(request.tokenIn);
  const output = wrappedTopazToken(request.tokenOut);
  if (input.toLowerCase() === output.toLowerCase())
    throw new Error(
      "Swap tokens must differ; native/wrapped pairs require wrapping",
    );
  if (request.amountIn <= 0n || request.amountIn > MAX_PERMIT2_AMOUNT)
    throw new Error("Topaz input must be a positive uint160 amount");
  const slippageBps = integer(request.slippageBps ?? 100, 1, 500);
  const deadlineSeconds = integer(request.deadlineSeconds ?? 600, 30, 1800);
  if (request.recipient) address(request.recipient);
  const response = await fetch(`${TOPAZ_ROUTING_URL}/quote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
      amount: request.amountIn.toString(),
      type: "exactIn",
      slippageBips: slippageBps,
      deadlineSeconds,
      recipient: request.recipient,
      permitGrantedInBatch: true,
      skipCache: true,
    }),
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Topaz routing API unavailable (${response.status})`);
  return validateTopazQuote(await response.json(), request);
}
