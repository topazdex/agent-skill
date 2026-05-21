// Canonical brand, social, and asset URLs for Topaz Dex.
// Logo/preview binaries are NOT vendored — the source of truth is the
// `topazdex/assets` GitHub repo (any branch update there propagates here).
// `yarn validate` (scripts/src/cli/validate.ts) enforces that every URL below
// also appears in README.md, SKILL.md, and references/brand.md.

const ASSETS_RAW = "https://raw.githubusercontent.com/topazdex/assets/main";

export const BRAND = {
  name: "Topaz Dex",
  shortName: "Topaz",

  website: "https://topazdex.com",
  docs: "https://www.topazdex.com/docs",
  x: "https://x.com/TopazDex",
  telegram: "https://t.me/TopazDex",
  github: "https://github.com/topazdex",

  // Source repo for brand assets — clone or browse for additions.
  assetsRepo: "https://github.com/topazdex/assets",

  // Direct asset URLs (CDN-cached via raw.githubusercontent.com).
  assets: {
    logoPng: `${ASSETS_RAW}/logo.png`,
    logoSvg: `${ASSETS_RAW}/logo.svg`,
    tokenLogoPng: `${ASSETS_RAW}/token-logo.png`,
    topaz100Png: `${ASSETS_RAW}/topaz100.png`,
    previewJpg: `${ASSETS_RAW}/preview.jpg`,
  },
} as const;

export type BrandAssetKey = keyof typeof BRAND.assets;
