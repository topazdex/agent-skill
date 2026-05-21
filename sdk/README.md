# Topaz SDK Layer

This directory documents the SDK-facing layer for developers building on Topaz.

The current implementation lives in the existing scripts package to avoid duplicating protocol logic:

```text
scripts/src/index.ts              # public export surface
scripts/src/lib/txBuilders.ts     # wallet-ready transaction builders
scripts/src/read/*                # read/quote/analytics helpers
scripts/src/config/*              # addresses, chain, token metadata
```

Use `developers/DEVELOPERS.md` for integration guidance and `scripts/README.md` for CLI and programmatic usage.

## Current import surface

```ts
import {
  ADDR,
  TOKENS,
  bestQuote,
  buildBestSwapTx,
  buildV2SwapTx,
  buildV3SwapTx,
  getV3PoolInfo,
} from "../scripts/src/index.js";
```

## Package direction

This can become a standalone npm package later without moving the protocol code again. Recommended next steps:

1. Rename `scripts/package.json` from `topaz-skill-scripts` to a publishable package name such as `@topazdex/sdk`.
2. Set `private: false` when ready to publish.
3. Add `tsup` or another build step to emit `dist/` ESM + type declarations.
4. Keep `scripts/src/index.ts` as the stable public API boundary.
5. Treat files not exported from `src/index.ts` as internal implementation details.

Until then, the repository functions as both an agent skill and a reference SDK implementation.
