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

For Topaz API swaps:

1. Validate chain 56 and resolve token metadata and decimals.
2. Build a fresh `TopazSwapBatch` with `buildTopazSwapBatch` or `buildBestSwapTx`.
3. Review and simulate the complete ordered `batch.transactions` from `batch.payer`.
4. Submit every call in one atomic wallet/account batch when `batch.atomicRequired` is true.
5. Confirm the receipt and refresh balances.

ERC20 swaps include the direct-router allowance reset, token reset/grant to Permit2, Permit2 grant, swap and both cleanup calls. Never send only the router transaction, and never request a separate Permit2 signature for this path.

## BNB vs WBNB

- `buildTopazSwapBatch` uses raw bigint amounts. Pass `BNB` explicitly for native input/output; a WBNB address means ERC20.
- `buildBestSwapTx` accepts human units and WBNB addresses. WBNB is ERC20 by default; `useBnb: true` explicitly requests native BNB for the WBNB side.
- Native input has one payable router call. ERC20 input requires the entire atomic approval/swap/cleanup batch.
- Explicit legacy direct-router builders retain `useBnb: true` as their default and return `BuiltSwapTx`. Set `useBnb: false` to retain ERC20 WBNB in those legacy builders.

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

const batch = await buildBestSwapTx({ tokenIn, tokenOut, amountIn, recipient });

// before showing the "Sign" button:
if (isStale(batch)) {
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

For API swaps, review and submit every entry in `batch.transactions` atomically from `batch.payer`; there is no singular `approval` or top-level swap transaction. See [Permit2 batch integration](../references/swapping-api.md).
