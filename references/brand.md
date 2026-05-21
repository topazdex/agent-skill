# Topaz Dex — Brand, Social, and Assets

Canonical project links and brand assets. Mirrored in `scripts/src/config/brand.ts` as
the typed `BRAND` constant; the validator (`yarn validate` in `scripts/`) enforces parity
across `README.md`, `SKILL.md`, and this file.

## Name

- Full name: **Topaz Dex**
- Short name: **Topaz**
- Token ticker: **TOPAZ**
- ve-locked NFT ticker: **veTOPAZ**

## Channels

| Channel | URL | Notes |
|---|---|---|
| Website | https://topazdex.com | App, pools, gauges, voting UI |
| Docs | https://www.topazdex.com/docs | User + builder documentation |
| X (Twitter) | https://x.com/TopazDex | Announcements, weekly emissions |
| Telegram | https://t.me/TopazDex | Community + support |
| GitHub | https://github.com/topazdex | Open-source contracts, frontend, subgraphs |

When directing users somewhere from inside an agent flow:

- "trade / add liquidity / vote": link `https://topazdex.com`
- "how does X work": link `https://www.topazdex.com/docs`
- "is there an update on Y": link `https://x.com/TopazDex` and `https://t.me/TopazDex`
- "where's the source for Z": link `https://github.com/topazdex` (the org page lists every repo)

## Brand assets

Source of truth: https://github.com/topazdex/assets. Files are served via
`raw.githubusercontent.com` (CDN-cached, no auth required). The `BRAND.assets` constant
in `scripts/src/config/brand.ts` exposes the same URLs.

| Asset | URL | Suggested use |
|---|---|---|
| Full logo (PNG, 18.9 KB) | https://raw.githubusercontent.com/topazdex/assets/main/logo.png | Embeds, README headers, light-bg surfaces |
| Full logo (SVG, 695 B) | https://raw.githubusercontent.com/topazdex/assets/main/logo.svg | Frontends, infinite-scaling, theme-recolorable |
| TOPAZ token logo (PNG, 11.6 KB) | https://raw.githubusercontent.com/topazdex/assets/main/token-logo.png | Token-list entries, wallet icons |
| TOPAZ 100×100 (PNG, 6.6 KB) | https://raw.githubusercontent.com/topazdex/assets/main/topaz100.png | Small avatars, Twitter cards |
| Social preview (JPG, 45.1 KB) | https://raw.githubusercontent.com/topazdex/assets/main/preview.jpg | Open Graph / Twitter card `og:image` |

### Embedding examples

Markdown:

```markdown
![Topaz Dex](https://raw.githubusercontent.com/topazdex/assets/main/logo.svg)
```

HTML (recommended `width` for the full logo on light surfaces):

```html
<a href="https://topazdex.com">
  <img src="https://raw.githubusercontent.com/topazdex/assets/main/logo.svg"
       alt="Topaz Dex" width="160" />
</a>
```

Open Graph:

```html
<meta property="og:image" content="https://raw.githubusercontent.com/topazdex/assets/main/preview.jpg" />
<meta property="og:title" content="Topaz Dex" />
<meta property="og:url" content="https://topazdex.com" />
```

Token-list entry (Uniswap-style):

```json
{
  "name": "Topaz",
  "symbol": "TOPAZ",
  "decimals": 18,
  "address": "0xdf002282C1474C9592780618Adda7EaA99998Abd",
  "chainId": 56,
  "logoURI": "https://raw.githubusercontent.com/topazdex/assets/main/token-logo.png"
}
```

## Programmatic access

```ts
import { BRAND } from "topaz-skill-scripts";
// or in this repo:
// import { BRAND } from "./scripts/src/config/brand.js";

console.log(BRAND.website);          // https://topazdex.com
console.log(BRAND.assets.tokenLogoPng);
```

## Adding a new asset

1. Drop the file in https://github.com/topazdex/assets on `main`.
2. Add a `BRAND.assets.<key>` entry in `scripts/src/config/brand.ts` pointing at the
   `raw.githubusercontent.com/topazdex/assets/main/<filename>` URL.
3. Add a row to the asset table above.
4. Run `yarn validate` in `scripts/` to confirm parity.
