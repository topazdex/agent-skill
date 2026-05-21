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
  approval?: {
    token: string;
    spender: string;
    amount: bigint;
  };
};
```

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

## Why builders reject some routes

`buildBestSwapTx` rejects quote-only mixed routes for now. That is deliberate: a builder should never convert a best quote into a different execution path without telling the user. If the best quote is mixed and your app cannot execute it atomically, re-quote with route constraints or show the best executable route separately.

## Production checklist

- Simulate the built transaction before asking the user to sign.
- Confirm the wallet is on BNB Chain mainnet (`chainId = 56`).
- Display the spender address for approvals.
- Display expected output, minimum output, route, and deadline.
- Refresh quotes before signing if the quote is older than 15-30 seconds.
- Never reuse calldata across users or sessions.
