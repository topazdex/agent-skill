# Eval 05 — Build a frontend quote widget

## Prompt

> Build a frontend quote widget for Topaz.

## Expected behavior

Point to `developers/quote-widget.md` and `developers/swap-calldata.md`. Include a short `fetchTopazQuote` or `bestQuoteBundle` example that renders API routes, splits, protocols and minimum output. Split and mixed CL/v2 routes are executable through the Universal Router.

Debounce input changes, discard stale responses and re-quote before building/executing. `TopazSwapBatch.quotedAt` and `deadline` indicate staleness. Display the API minimum for the user's chosen slippage, keep WBNB distinct from native BNB, and require the wallet adapter to submit the full Permit2 approval/swap/cleanup list atomically. Do not hardcode pool routes or send transactions from the quote widget.

## Machine-readable assertions

```yaml
assertions:
  output_kind: explanation
  expected_tool_calls: []
  forbidden_tool_calls:
    - 'broadcastTransaction'
    - 'sendTransaction'
  must_include:
    - 'developers/quote-widget\.md'
    - '(bestQuoteBundle|bestQuote|fetchTopazQuote)\('
    - '(minimumAmountOut|slippage)'
    - '(staleness|quotedAt|re-?quote)'
    - '(atomic|atomically)'
  must_not_include:
    - 'signer\.sendTransaction'
    - '(no atomic mixed router|mixed.*analytics.only)'
```
