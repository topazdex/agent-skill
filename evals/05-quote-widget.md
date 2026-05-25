# Eval 05 — Build a frontend quote widget

**Output kind:** `explanation`

## Prompt

> Build a frontend quote widget for Topaz.

## Skill activation

- [ ] `topaz` skill is loaded (trigger phrases "build" + "quote widget" + "Topaz").

## Expected reads

- [ ] Route the user to `developers/quote-widget.md` and `developers/swap-calldata.md`.
- [ ] Reference the typed import surface from `scripts/src/index.ts` (`bestQuoteBundle`, `bestQuote`, `bestV2Quote`, `bestV3Quote`, `buildBestSwapTx`, `findToken`, `TOKENS`).

## Expected writes

- `none`. This is a guidance / scaffold response.

## Final answer MUST include

- [ ] Pointer to `developers/quote-widget.md` (the canonical recipe).
- [ ] A short code snippet using `bestQuoteBundle(...)` so the UI can render the best v2 (basic) and best v3 (concentrated) routes side by side, plus the overall winner — all returned routes are always executable, the default search never emits mixed v2/v3 routes.
- [ ] Mention that the widget should re-quote on input change (debounced) and treat `BuiltSwapTx.quotedAt` as the staleness signal (default ~30 s).
- [ ] Clarify that mixed v2/v3 routes are not part of the default search; they can only be **priced** via `quoteMixed(...)` against `MixedRouteQuoterV1` for analytics, never **executed** in a single tx on Topaz today (no atomic mixed router).
- [ ] Note that the widget should compute and display `amountOutMin` after the user's chosen slippage.

## Final answer MUST NOT include

- [ ] A code snippet that calls `signer.sendTransaction(...)` inside the widget — widgets quote, wallets sign.
- [ ] An implementation that hardcodes pool addresses; the widget must resolve them via `findV2Pool` / `findV3Pool` (which the helpers already do).
- [ ] A claim that a mixed v2/v3 route can be executed atomically today (it cannot — no atomic mixed router exists on Topaz; `quoteMixed` is analytics-only).

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
    - '(bestQuoteBundle|bestQuote)\('
    - '(amountOutMin|slippage)'
    - '(staleness|quotedAt|re-?quote)'
  must_not_include:
    - 'signer\.sendTransaction'
    - '(mixed route .* (executable|atomic)|atomic mixed router)'
```

