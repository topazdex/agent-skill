# Eval 01 — Quote a swap

## Prompt

> Quote 0.5 WBNB → TOPAZ on Topaz.

## Expected behavior

Use `bestQuoteBundle`, `bestQuote`, `quoteHuman` or `fetchTopazQuote`. The default source is quote.topazdex.com, including split and mixed CL/v2 routes. Show the route proportions, human TOPAZ output and API minimum output at the selected slippage (default 100 bps). A quote is an estimate, not an executed swap. Do not invent separate v2/v3 alternatives or price impact.

No signing, write-side CLI or calldata is needed for this request.

## Machine-readable assertions

```yaml
assertions:
  output_kind: quote
  expected_tool_calls:
    - 'bestQuote(Bundle)?\(|quoteHuman\(|fetchTopazQuote\('
  forbidden_tool_calls:
    - 'scripts/src/write/'
    - 'signer\('
    - 'broadcastTransaction'
  must_include:
    - 'TOPAZ'
    - '(slippage|minimumAmountOut|minimum output)'
    - '(Topaz API|quote.topazdex.com)'
  must_not_include:
    - '(tx hash|sent on.chain)'
    - 'minimumAmountOut\s*=\s*0'
```
