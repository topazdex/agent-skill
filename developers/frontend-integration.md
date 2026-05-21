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

Topaz routes internally use WBNB. For native BNB input:

- pass `ADDR.WBNB` as `tokenIn`
- set transaction `value = amountIn`
- show the user that they are spending native BNB

For BNB output, make sure the execution path unwraps WBNB if your UX promises native BNB. Not every helper currently implements every unwrap variant.

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

## Error handling

Common errors to map into user-friendly messages:

- no pool exists for pair/tick spacing
- quote returned zero
- insufficient allowance
- insufficient balance
- transaction would receive less than minimum output
- voting window closed / already voted this epoch
- RPC timeout or rate limit
