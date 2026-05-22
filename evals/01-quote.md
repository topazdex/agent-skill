# Eval 01 — Quote a swap

**Output kind:** `quote`

## Prompt

> Quote 0.5 WBNB → TOPAZ on Topaz.

## Skill activation

- [ ] `topaz` skill is loaded (trigger phrase "on topaz" + "quote", token names WBNB/TOPAZ).

## Expected reads

- [ ] `quoteHuman(WBNB, TOPAZ, "0.5")` **or** `bestQuoteBundle(WBNB, TOPAZ, 5n * 10n ** 17n)` (returns best v2 + best v3, plus overall winner) followed by human formatting.
- [ ] No write-side calls, no `signer()`, no CLI under `scripts/src/write/`.

## Expected writes

- `none`.

## Final answer MUST include

- [ ] Winning route description (e.g. "v3 direct ts=200", "v2 volatile → stable via USDT", "v3 ts=1 → ts=200 via USDT").
- [ ] `amountOut` in human units (TOPAZ, 18 decimals).
- [ ] Slippage caveat — at the skill's default of 1% for v3 (0.5% for v2 direct), the `amountOutMin` the user would actually receive.
- [ ] Note that this is a **quote**, not a built tx.

## Final answer MUST NOT include

- [ ] A `to` / `data` / `value` calldata blob (that's eval 02, not this one).
- [ ] Any broadcast language ("sent", "tx hash", "executed").
- [ ] An offer to immediately swap without an explicit user ask.
- [ ] `amountOutMin = 0` or "no slippage applied".
