import { concat, getBytes, hexlify, getAddress } from "ethers";

// MixedRouteQuoterV1 sentinels (encoded into the 3-byte int24 "tickSpacing" slot).
export const V2_VOLATILE = -1; // 0xFFFFFF
export const V2_STABLE = -2;   // 0xFFFFFE

function intToInt24Bytes(value: number): Uint8Array {
  // 24-bit two's complement big-endian
  const masked = value & 0xffffff;
  return new Uint8Array([(masked >> 16) & 0xff, (masked >> 8) & 0xff, masked & 0xff]);
}

function int24FromBytes(bytes: Uint8Array): number {
  const u = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
  // sign-extend
  return u & 0x800000 ? u - 0x1000000 : u;
}

/**
 * Encode a v3 swap path:
 *   path = token0 (20) | tickSpacing (3) | token1 (20) | tickSpacing (3) | token2 ...
 * spacings.length must equal tokens.length - 1.
 */
export function encodePath(tokens: string[], spacings: number[]): string {
  if (tokens.length !== spacings.length + 1) {
    throw new Error(`bad path: ${tokens.length} tokens vs ${spacings.length} spacings`);
  }
  const parts: Uint8Array[] = [];
  for (let i = 0; i < spacings.length; i++) {
    parts.push(getBytes(getAddress(tokens[i])));
    parts.push(intToInt24Bytes(spacings[i]));
  }
  parts.push(getBytes(getAddress(tokens[tokens.length - 1])));
  return hexlify(concat(parts));
}

/**
 * Encode a mixed v2/v3 path for MixedRouteQuoterV1.
 * Use V2_VOLATILE / V2_STABLE for v2 hops; positive int for v3 tick spacing.
 */
export const encodeMixedPath = encodePath;

/**
 * Decode a path into [tokens[], hops[]].
 */
export function decodePath(pathHex: string): { tokens: string[]; spacings: number[] } {
  const bytes = getBytes(pathHex);
  if ((bytes.length - 20) % 23 !== 0) {
    throw new Error("decodePath: bad length");
  }
  const tokens: string[] = [];
  const spacings: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    tokens.push(getAddress(hexlify(bytes.slice(i, i + 20))));
    i += 20;
    if (i >= bytes.length) break;
    spacings.push(int24FromBytes(bytes.slice(i, i + 3)));
    i += 3;
  }
  return { tokens, spacings };
}
