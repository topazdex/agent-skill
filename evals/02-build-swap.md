# Eval 02 — Build a complete swap batch, do not broadcast

## Prompt

> Build a swap batch for 0.5 WBNB → TOPAZ on Topaz for account 0x1111111111111111111111111111111111111111, but do not send it.

## Expected behavior

Read `references/swapping-api.md` and use `buildBestSwapTx` or `buildTopazSwapBatch`. Both fetch a fresh API quote. WBNB is an ERC20 input unless native BNB is explicitly requested.

Return the complete ordered `transactions` list: token reset, token approval to Permit2, Permit2 approval to the router, swap, Permit2 cleanup, token allowance cleanup. Include every call's `to`, `data`, and `value` (zero for WBNB), plus `quote.quote`, `quote.minimumAmountOut`, slippage, deadline and quotedAt. The executing input-owning account is also the recipient.

Explain that the wallet must submit every call atomically; `permit2SignatureRequired: false` removes only the extra Permit2 signature. The owner still confirms the transaction. Nothing has been broadcast. Never return only the swap call or execute sequential EOA transactions as if they were atomic.

## Machine-readable assertions

```yaml
assertions:
  output_kind: built calldata
  expected_tool_calls:
    - 'buildBestSwapTx\(|buildTopazSwapBatch\('
  forbidden_tool_calls:
    - 'scripts/src/write/'
    - 'src/cli/(swap|lp|lock|vote|claim|bribe)\.ts'
    - 'signer\('
    - 'broadcastTransaction'
    - 'sendTransaction'
    - 'PRIVATE_KEY'
  must_include:
    - '\btransactions\b'
    - '\bto\b'
    - '\bdata\b'
    - '\bvalue\b'
    - 'minimumAmountOut'
    - '(deadline|quotedAt)'
    - '(atomic|atomically)'
    - 'Permit2'
    - '(not broadcast|nothing has been broadcast|wallet.*confirm)'
  must_not_include:
    - '(tx hash|sent on.chain|in progress|pending)'
    - 'minimumAmountOut\s*=\s*0'
```
