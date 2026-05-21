# Eval 05 — Build a frontend quote widget

**Output kind:** `explanation`

## Prompt

> Build a frontend quote widget for Topaz.

## Skill activation

- [ ] `topaz` skill is loaded (trigger phrases "build" + "quote widget" + "Topaz").

## Expected reads

- [ ] Route the user to `developers/quote-widget.md` and `developers/swap-calldata.md`.
- [ ] Reference the typed import surface from `scripts/src/index.ts` (`bestQuote`, `buildBestSwapTx`, `findToken`, `TOKENS`).

## Expected writes

- `none`. This is a guidance / scaffold response.

## Final answer MUST include

- [ ] Pointer to `developers/quote-widget.md` (the canonical recipe).
- [ ] A short code snippet using `bestQuote({ allowMixed: false })` — the **executable** mode — because the snippet is meant to feed a swap, not just display options.
- [ ] Mention that the widget should re-quote on input change (debounced) and treat `BuiltSwapTx.quotedAt` as the staleness signal (default ~30 s).
- [ ] Clarify that mixed v2/v3 routes (`allowMixed: true`) can be **displayed** but cannot be **executed** today on Topaz (no atomic mixed router).
- [ ] Note that the widget should compute and display `amountOutMin` after the user's chosen slippage.

## Final answer MUST NOT include

- [ ] A code snippet that calls `signer.sendTransaction(...)` inside the widget — widgets quote, wallets sign.
- [ ] An implementation that hardcodes pool addresses; the widget must resolve them via `findV2Pool` / `findV3Pool` (which the helpers already do).
- [ ] A claim that `allowMixed: true` is safe for execution (it isn't, today).
