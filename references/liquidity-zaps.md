# Concentrated liquidity single-token zaps

CL Zap creates a **new, initially unstaked NFT in an existing CL pool** from one input token, using zero, one or two 0x swap legs. It does not increase an existing NFT, initialize a pool, stake it, or mint xTOPAZ shares. The BNB vault's XTopazZap is unrelated.

The [deployment catalog](deployments.md) includes CLZap on BNB, Robinhood, Base and Ethereum, with the [integration ABI](abis/deployed/CLZap.json). Arc has no deployed CLZap in this snapshot. The ABI is the user-facing function/event/error surface, not a claim that admin functions are included.

## Prepare and verify

Resolve the selected chain's CLZap, CLFactory, position manager and wrapped native. Read zap `paused()`, `CL_FACTORY()`, `NPM()`, `WRAPPED_NATIVE()`, `ALLOWANCE_HOLDER()` and `SETTLER_REGISTRY()`. The expected 0x infrastructure in these deployments is AllowanceHolder `0x0000000000001fF3684f28c67538d4D072C22734` and SettlerRegistry `0x00000000000004533Fe15556B1E086BB1A72cEae`; verify live code and current Settler authorization.

Get the pool through `CLFactory.getPool(token0,token1,tickSpacing)`, with sorted tokens, real decimals and fresh `slot0`. Align ticks to spacing and price the range using integer CL math. A one-sided out-of-range mint can need no swap if the funding token is the required pool token. Otherwise choose the sell allocation based on the liquidity supported by both net amounts, not a universal 50/50 split.

For each needed leg, request a fresh firm 0x quote with zap as taker/recipient and the actual source EOA as txOrigin. Check provider support, chain, token identities, exact sell caps, authorized AllowanceHolder envelope and current/previous Settler, simulation metadata, fees and untaxed token assumptions. A returned arbitrary target/calldata is not authorization to approve it. If those execution facts cannot be verified, use the website's supported zap flow or ordinary two-token liquidity.

## Exact call shape

```text
zapIn(p, swaps)
p = {
  inputToken, amountIn, token0, token1, tickSpacing, tickLower, tickUpper,
  amount0Min, amount1Min, minLiquidity, expectedTick, maxTickDeviation,
  recipient, deadline, unwrapNativeRefund, quoteId
}
swaps[] = { sellToken, buyToken, sellAmount, minBuyAmount, allowanceHolderCalldata }
```

Use the bundled ABI for tuple widths and encoding. Input amounts/minima are raw token units; liquidity is uint128, ticks are int24, quoteId is bytes32. Native input uses zero inputToken and `value=amountIn`; routed sellToken/buyToken remain ERC20 addresses. ERC20 input requires exact allowance **to CLZap**, with `value=0`. The user never separately funds the zap or approves a Settler. Reset an incompatible preexisting allowance when needed.

Protect routed inventory with minBuyAmount, mint with price-bound amount minima and positive minLiquidity, and pool movement with expectedTick/maxTickDeviation. Do not apply buy-token fees twice if already included in net quote output. A boundary can legitimately make one mint minimum zero. Preserve the user's reviewed floors on refresh; if a new quote cannot meet them, return to review.

After approvals, refresh quotes/state, simulate the complete zap from the actual EOA with native value, then estimate gas. Account-abstraction callers need their real executor/bundler origin and complete execution simulation; an EOA test does not prove smart-wallet compatibility.

## Reconcile

Read the zap's own matching mint event, including sender, recipient, pool, input, amount, ticks, quoteId and minimum outcome; do not infer the minted ID from an unrelated NFT Transfer. Decode `Refunded` events for actual leftovers. Only then offer a separate stake after resolving a live local CL gauge and obtaining its NFT approval. Keep the original source hash during unknown confirmation states; never resubmit solely because the index has not found the position.

The deployed app evidence distinguishes read-only quote assembly and local fork zero-swap execution from signed routed zaps on the live network. This skill's verification checks code and wiring, not all funded zap variants. Website entry: [liquidity positions](https://topazdex.com/positions), [zap documentation](https://www.topazdex.com/docs/liquidity/zaps).
