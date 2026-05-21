# Swap Calldata Builders

Most applications should not call helper functions that directly broadcast transactions with a local private key. Instead, build calldata and hand it to the user's wallet.

The builder helpers live in:

```text
scripts/src/lib/txBuilders.ts
```

They return:

```ts
type BuiltSwapTx = {
  to: string;
  data: string;
  value: bigint;
  expectedOut: bigint;
  amountOutMin: bigint;
  route: string;
  quotedAt: number;   // unix seconds; use for freshness checks
  deadline: number;   // unix seconds passed to the router
  approval?: {
    token: string;
    spender: string;
    amount: bigint;
  };
};
```

Every builder validates inputs before quoting:

- `tokenIn` / `tokenOut` / `recipient` must be valid (checksummable) addresses; malformed strings throw.
- `tokenIn !== tokenOut`, `recipient !== ZeroAddress`, `amountIn > 0`.
- `slippageBps` is clamped to `0..10000` (0%..100%). Anything else throws.
- `deadline` must be strictly in the future.

If any check fails the builder throws synchronously — no half-built calldata is returned.

## Skipping redundant approvals

Pass `payer` (the address that will sign and supply `tokenIn`) and the builder will read `allowance(tokenIn, payer, spender)` and **omit** the `approval` field when the existing allowance already covers `amountIn`. This saves the user a tx and a gas trip:

```ts
const tx = await buildBestSwapTx({
  tokenIn: ADDR.WBNB,
  tokenOut: ADDR.TOPAZ,
  amountIn: "0.5",
  recipient: userAddress,
  payer: userAddress,       // <-- enables the allowance check
  slippageBps: 100n,
});

if (tx.approval) {
  // truly needed; have the wallet sign approve() first
}
```

Omit `payer` entirely if you'd rather always emit the approval and let the wallet decide.

## Best-route swap

```ts
import { ADDR, buildBestSwapTx } from "../scripts/src/index.js";

const tx = await buildBestSwapTx({
  tokenIn: ADDR.WBNB,
  tokenOut: ADDR.TOPAZ,
  amountIn: "0.5",
  recipient: userAddress,
  slippageBps: 100n,
});

// ethers BrowserProvider example
await signer.sendTransaction({
  to: tx.to,
  data: tx.data,
  value: tx.value,
});
```

## v3 single-pool swap

```ts
import { ADDR, buildV3SwapTx } from "../scripts/src/index.js";

const tx = await buildV3SwapTx({
  tokenIn: ADDR.WBNB,
  tokenOut: ADDR.TOPAZ,
  amountIn: "1",
  tickSpacing: 200,
  recipient: userAddress,
  slippageBps: 100n,
});
```

For BNB-in swaps, use WBNB as `tokenIn`; the builder sets `value = amountIn` and encodes the payable v3 router call.

## v2 swap

```ts
import { ADDR, buildV2SwapTx } from "../scripts/src/index.js";

const tx = await buildV2SwapTx({
  tokenIn: ADDR.WBNB,
  tokenOut: "0xTOKEN",
  amountIn: "0.25",
  stable: false,
  recipient: userAddress,
  slippageBps: 50n,
  useBnb: true,
});
```

## ERC20 approvals

If `approval` is returned, the user must approve the spender before submitting the swap transaction.

```ts
if (tx.approval) {
  await erc20.write.approve([tx.approval.spender, tx.approval.amount]);
}
```

Native BNB-in routes do not require ERC20 approval. ERC20-in routes do.

## Why builders skip some routes

`buildBestSwapTx` quotes with `allowMixed: false` and therefore only ever picks a route whose `exec.type` is `v2`, `v3-single`, or `v3-path`. Mixed v2/v3 routes are returned by `bestQuote` (with `allowMixed: true`, the default) because the on-chain `MixedRouteQuoterV1` can price them accurately, but Topaz does not currently expose an atomic mixed-route executor, so a builder would otherwise have to broadcast leg-by-leg with extra MEV / partial-fill risk. If you want to inspect or display the raw best route — including mixed — call `bestQuote(...)` directly and only hand the result to `buildFromExecRoute(...)` after you confirm the leg you are willing to execute.

## Production checklist

- Simulate the built transaction before asking the user to sign.
- Confirm the wallet is on BNB Chain mainnet (`chainId = 56`).
- Display the spender address for approvals.
- Display expected output, minimum output, route, and deadline.
- Refresh quotes before signing if the quote is older than 15-30 seconds.
- Never reuse calldata across users or sessions.
