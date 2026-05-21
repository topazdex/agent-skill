# Frontend Integration Notes

This recipe is for browser dApps using wallet libraries such as wagmi, viem, ethers, RainbowKit, or WalletConnect.

## Chain config

Topaz is on BNB Chain mainnet:

```ts
export const bnbMainnet = {
  id: 56,
  name: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://bsc-rpc.publicnode.com"] },
  },
};
```

Use your own production RPC. Public RPCs can rate-limit and are not suitable for high-volume quoting.

## Wallet flow

A safe swap flow:

1. Validate wallet is on chain 56.
2. Resolve token metadata and decimals.
3. Quote route.
4. Build calldata.
5. If ERC20-in, request approval to the exact router spender.
6. Simulate the swap transaction.
7. Ask the user to sign.
8. Track tx receipt and refresh balances.

## BNB vs WBNB

Topaz routes internally use WBNB. The wallet-facing convention used by the builders in `scripts/src/lib/txBuilders.ts` is:

- pass `ADDR.WBNB` as `tokenIn` to spend **native BNB**
- with the default `useBnb: true`, the builder will set `value = amountIn` and route through the payable swap method (v2 `swapExactETHForTokens` or v3 `exactInputSingle` with `msg.value`); no ERC20 approval is required
- pass `useBnb: false` (still with `ADDR.WBNB` as `tokenIn`) to spend **already-held WBNB** as an ERC20 — the builder uses `swapExactTokensForTokens` / `exactInputSingle` non-payable and emits an `approval` requirement
- on v2 with `tokenOut === ADDR.WBNB` and `useBnb: true`, the builder routes through `swapExactTokensForETH` and the user receives native BNB

> **v3 BNB-out is not implemented in the builders today.** Receiving native BNB from a v3 swap requires `SwapRouter.multicall([exactInputSingle(recipient=Router, ...), unwrapWETH9(amountMin, recipient=user)])` and lives outside the current `buildV3SwapTx` calldata. If your UX promises native BNB out of a v3 route, either (a) wrap the two calls yourself against the SwapRouter ABI, or (b) route via v2 if a v2 pool exists for the pair, or (c) accept WBNB out and unwrap with a follow-up `WBNB.withdraw(amount)` call. Track this gap before shipping.

## Approvals

Do not request unlimited approvals by default. Prefer exact-amount approvals for conservative UX, or make unlimited approvals a clear opt-in.

Show:

- token being approved
- spender address
- amount
- why approval is needed

## Quote freshness

Refresh quotes frequently and invalidate old calldata:

- 15-30 seconds for volatile/long-tail pairs
- immediately after input amount or slippage changes
- immediately after the user changes wallet/chain

Use the `isStale(tx, maxAgeSeconds?)` helper exported from `@topazdex/agent-skill` (or `scripts/src/lib/txBuilders.ts`) instead of reinventing the math. It returns `true` when either the underlying quote is older than `maxAgeSeconds` (default 30) or the tx's `deadline` has passed:

```ts
import { buildBestSwapTx, isStale } from "./scripts/src";

const tx = await buildBestSwapTx({ tokenIn, tokenOut, amountIn, recipient });

// before showing the "Sign" button:
if (isStale(tx)) {
  // rebuild calldata, then re-render
}
```

## Error handling

Common errors to map into user-friendly messages:

- no pool exists for pair/tick spacing
- quote returned zero
- insufficient allowance
- insufficient balance
- transaction would receive less than minimum output
- voting window closed / already voted this epoch
- RPC timeout or rate limit
