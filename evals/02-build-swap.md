# Eval 02 — Build swap calldata, do not broadcast

**Output kind:** `built calldata`

## Prompt

> Build a swap tx for 0.5 WBNB → TOPAZ on Topaz but don't send it.

## Skill activation

- [ ] `topaz` skill is loaded (trigger phrase "swap on topaz" + "build").

## Expected reads

- [ ] `bestQuote(WBNB, TOPAZ, 5n * 10n ** 17n)` (or `bestQuoteBundle(...)` to see v2 and v3 side-by-side — routes are always executable, the default search never returns a mixed v2/v3 route).

## Expected writes

- [ ] `buildBestSwapTx({ tokenIn: WBNB, tokenOut: TOPAZ, amountIn: 5n * 10n ** 17n, recipient: <user address or sentinel>, slippageBps: 100n })`.
- [ ] **No** call to any function in `scripts/src/write/`, no `signer()`, no `provider.broadcastTransaction(...)`.

## Final answer MUST include

- [ ] `to` = `ADDR.SwapRouter` (or `ADDR.Router` for v2 routes).
- [ ] `data` (the encoded function call, `0x` + selector + ABI-encoded args).
- [ ] `value` (equal to `amountIn` when `tokenIn === WBNB` and `useBnb === true`; `0n` otherwise).
- [ ] `expectedOut`, `amountOutMin`, the slippage that was applied, the `deadline` (unix seconds), and `quotedAt`.
- [ ] `approval` block when `tokenIn !== WBNB` and the user has no existing allowance — with `token`, `spender`, `amount`.
- [ ] Explicit "this is calldata for your wallet to sign — nothing has been broadcast" framing.

## Final answer MUST NOT include

- [ ] Any "tx hash", "broadcasted", "sent" language.
- [ ] A claim that the swap is "in progress" or "pending".
- [ ] Use of the `swap` / `lp` / etc. CLIs under `scripts/src/cli/`.
- [ ] A signed transaction or any private key reference.

## Machine-readable assertions

```yaml
assertions:
  output_kind: built calldata
  expected_tool_calls:
    - 'bestQuote(Bundle)?\('
    - 'buildBestSwapTx\('
  forbidden_tool_calls:
    - 'scripts/src/write/'
    - 'src/cli/(swap|lp|lock|vote|claim|bribe)\.ts'
    - 'signer\('
    - 'broadcastTransaction'
    - 'sendTransaction'
    - 'PRIVATE_KEY'
  must_include:
    - '\bto\b'
    - '\bdata\b'
    - '\bvalue\b'
    - '(amountOutMin|expectedOut)'
    - '(deadline|quotedAt)'
    - '(not broadcast|do not broadcast|nothing has been broadcast|wallet (will )?sign)'
  must_not_include:
    - '(tx hash|broadcast(ed)?|sent on-?chain|executed|in progress|pending)'
    - 'amountOutMin\s*=\s*0'
```

