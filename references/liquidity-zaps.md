# Concentrated liquidity single-token zaps

CL Zap creates a **new, initially unstaked NFT in an existing CL pool** from one input token, using zero, one or two 0x swap legs. It does not increase an existing NFT, initialize a pool, stake it, or mint xTOPAZ shares. The BNB vault's XTopazZap is unrelated.

The [deployment catalog](deployments.md) includes CLZap on all five chains, with the [integration ABI](abis/deployed/CLZap.json). The ABI is the user-facing function/event/error surface, not a claim that admin functions are included.

**Rollout.** The contract is deployed and unpaused on every chain, but as of 2026-09-29 the website enables the zap on **BNB only**. Robinhood, Base, Ethereum and Arc are deployed from unchanged source and wait on full zap simulation and canary deposits. On those chains, a zap built from this guide is outside the website's tested path: simulate the complete transaction and tell the user it is a new rollout.

**Arc.** Input is the USDC ERC20 (`0x3600…0000`, 6 decimals) only. `WRAPPED_NATIVE()` returns a placeholder that always reverts, so native input and `unwrapNativeRefund` fail. 0x currently has no Arc liquidity, so an Arc zap works only when no swap leg is needed: USDC into a USDC pair where the range needs only USDC, or a one-sided out-of-range mint funded in USDC.

## Prepare and verify

Resolve the selected chain's CLZap, CLFactory, position manager and wrapped native. Read zap `paused()`, `CL_FACTORY()`, `NPM()`, `WRAPPED_NATIVE()`, `ALLOWANCE_HOLDER()` and `SETTLER_REGISTRY()`. The expected 0x infrastructure in these deployments is AllowanceHolder `0x0000000000001fF3684f28c67538d4D072C22734` and SettlerRegistry `0x00000000000004533Fe15556B1E086BB1A72cEae`; verify live code and current Settler authorization.

Get the pool through `CLFactory.getPool(token0,token1,tickSpacing)`, with sorted tokens, real decimals and fresh `slot0`. Align ticks to spacing and price the range using integer CL math. A one-sided out-of-range mint can need no swap if the funding token is the required pool token. Otherwise choose the sell allocation based on the liquidity supported by both net amounts, not a universal 50/50 split.

For each needed leg, request a fresh firm 0x quote with zap as taker/recipient and the actual source EOA as txOrigin (see [0x quotes for zaps](#0x-quotes-for-zaps)). Check provider support, chain, token identities, exact sell caps, authorized AllowanceHolder envelope and current/previous Settler, simulation metadata, fees and untaxed token assumptions. A returned arbitrary target/calldata is not authorization to approve it. If those execution facts cannot be verified, use the website's supported zap flow or ordinary two-token liquidity.

## 0x quotes for zaps

Both CLZap and the [Auto Manage zap](auto-manage.md) take 0x AllowanceHolder swap legs. Integrators may get them from the Topaz website's public 0x proxy, which is what the website and the Topaz agent use:

```text
GET https://www.topazdex.com/api/0x?path=swap/allowance-holder/price&chainId=56&sellToken=0x…&buyToken=0x…&sellAmount=…&taker=<zap>
GET https://www.topazdex.com/api/0x?path=swap/allowance-holder/quote&chainId=56&sellToken=0x…&buyToken=0x…&sellAmount=…
    &taker=<zap>&recipient=<zap>&txOrigin=<user wallet>&slippageBps=100
```

- `price` is indicative, for sizing only. `quote` is firm and returns the AllowanceHolder `transaction` whose `data` becomes the zap's swap calldata.
- `taker` and `recipient` are the **zap contract**, not the user. `txOrigin` is the wallet that will submit the zap; 0x rejects addresses at or below `0xffff`.
- This proxy is a swap-quote service on the website host, separate from the `/v1` analytics API.

**Fees.** The proxy includes Topaz's **0.6% integrator fee** (`fees.integratorFee`, 60 bps), and 0x adds its own (`fees.zeroExFee`, 15 bps observed on 2026-09-29). 0x charges both in **either the sell token or the buy token**, depending on the pair. `buyAmount` and `minBuyAmount` are already net of both, so never subtract them again. `fees.integratorFees` repeats `integratorFee` as a list; count it once. Disclose the fees to the user.

**Constraints.**
- 0x currently has no liquidity on Arc (`liquidityAvailable: false`). An Arc zap works only when no swap leg is needed.
- The proxy is rate-limited and answers `429` under load. Back off and retry. Size splits in closed form (below), never with an iterative search.
- Quotes are firm for a short time. Build, simulate and submit promptly, and rebuild rather than reuse a stale quote.

**Sizing the split.** For an input token A, each side's capacity is linear in its amount. Take one indicative `price` per bought token at a sample size (half the input) to get `out0/in0` and `out1/in1`. Let `c0` and `c1` be how much of the target one unit of token0 or token1 fills (for a vault, `1 / total0` and `1 / total1`; for a CL range, the liquidity per unit at the current price). Then:

```text
toToken0 = A · c1·out1·in0 / (c0·out0·in1 + c1·out1·in0)
toToken1 = A − toToken0
```

If the input is one of the pool tokens, its "rate" is 1:1 and it needs no quote. If the target takes only one token, sell everything into it. Then request one firm quote per non-empty leg, and set the mint or share minimum from each leg's firm `minBuyAmount` (plus any retained input), never from the indicative price.

**Validate every firm quote** before using its calldata:

- tokens and `sellAmount` match the request, `liquidityAvailable` is true, and `minBuyAmount` is positive and at most `buyAmount`
- `transaction.to` and `allowanceTarget` are the canonical AllowanceHolder `0x0000000000001fF3684f28c67538d4D072C22734`, with zero native value
- `issues.simulationIncomplete` is `false` and `invalidSourcesPassed` is empty
- no buy, sell or transfer tax in `tokenMetadata`
- each fee is a known kind, charged in the sell or buy token, and within its cap against that token's gross amount
- the `exec(operator, token, amount, target, data)` envelope sells exactly the requested token and amount, with `operator == target` equal to the SettlerRegistry's current `ownerOf(2)` or previous `prev(2)` Settler on that chain

Then simulate the whole zap from the user's wallet. From `scripts/`: `indicativeBuyAmount`, `firmSwapLeg`, `validateFirmQuote`, `acceptedSettlers` and `findSplit` in `src/lib/zeroX.ts` implement all of this; set `TOPAZ_ZEROX_PROXY_URL` to use another proxy.

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
