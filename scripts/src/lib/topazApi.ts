// Minimal client for the public multichain Topaz API (https://api.topazdex.com/v1).
// Read-only, no auth. Response schemas are owned by the OpenAPI contract at
// https://api.topazdex.com/openapi.json; this module preserves the envelope
// (`ok` / `data` / `meta` / `pageInfo`) and lets the caller type `data`.

export const TOPAZ_API_BASE_URL = (process.env.TOPAZ_API_URL ?? "https://api.topazdex.com").replace(/\/+$/, "");

export type TopazApiQueryValue = string | number | boolean | ReadonlyArray<string | number> | null | undefined;
export type TopazApiQuery = Record<string, TopazApiQueryValue>;

export interface TopazApiPageInfo {
  hasNextPage: boolean;
  nextCursor: string | null;
}

export interface TopazApiOk<T> {
  ok: true;
  data: T;
  meta: Record<string, unknown>;
  pageInfo?: TopazApiPageInfo;
}

export interface TopazApiFailure {
  ok: false;
  error: { code: string; message: string; docs?: string; [key: string]: unknown };
  meta?: Record<string, unknown>;
}

export type TopazApiResponse<T> = TopazApiOk<T> | TopazApiFailure;

export class TopazApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly url: string,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(`${code}: ${message} (${status} ${url})`);
    this.name = "TopazApiRequestError";
  }
}

export interface FetchV1Options {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
}

/** `56:0xdf00…` form used by `/v1/prices?tokens=` and other chain-qualified filters. */
export function chainQualified(chainId: number, address: string): string {
  if (!Number.isInteger(chainId) || chainId <= 0) throw new Error(`Invalid chainId ${chainId}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`Invalid address ${address}`);
  return `${chainId}:${address.toLowerCase()}`;
}

export function v1Url(path: string, query?: TopazApiQuery): string {
  if (/^https?:\/\//i.test(path)) throw new Error("Pass a /v1 route path, not a full URL");
  if (!path.startsWith("/")) throw new Error(`Route path must start with '/': ${path}`);
  const route = path === "/v1" || path.startsWith("/v1/") ? path : `/v1${path}`;
  const url = new URL(`${TOPAZ_API_BASE_URL}${route}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    const serialized = Array.isArray(value) ? value.join(",") : String(value);
    if (serialized === "") continue;
    url.searchParams.set(key, serialized);
  }
  return url.toString();
}

export async function fetchV1<T = unknown>(
  path: string,
  query?: TopazApiQuery,
  options: FetchV1Options = {},
): Promise<TopazApiOk<T>> {
  const url = v1Url(path, query);
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: { accept: "application/json", ...options.headers },
    signal: options.signal,
  });
  const text = await res.text();
  let body: TopazApiResponse<T>;
  try {
    body = JSON.parse(text) as TopazApiResponse<T>;
  } catch {
    throw new TopazApiRequestError(res.status, "non_json_response", text.slice(0, 200) || res.statusText, url);
  }
  if (!body || typeof body !== "object" || typeof (body as { ok?: unknown }).ok !== "boolean") {
    throw new TopazApiRequestError(res.status, "malformed_envelope", "response has no boolean `ok`", url);
  }
  if (!body.ok) {
    throw new TopazApiRequestError(res.status, body.error?.code ?? "unknown", body.error?.message ?? "request failed", url, body.meta);
  }
  return body;
}

export interface FetchV1PagesOptions extends FetchV1Options {
  /** Upper bound on cursor follows; the API rejects synthesized cursors, so only `pageInfo.nextCursor` is reused. */
  maxPages?: number;
}

/**
 * Follows `pageInfo.nextCursor` with unchanged filters and concatenates each page's `data` array.
 * `meta` is taken from the first page (later pages share its snapshot pins).
 */
export async function fetchV1Pages<T = unknown>(
  path: string,
  query: TopazApiQuery = {},
  options: FetchV1PagesOptions = {},
): Promise<{ data: T[]; meta: Record<string, unknown>; pages: number }> {
  const maxPages = options.maxPages ?? 20;
  if (maxPages < 1) throw new Error("maxPages must be at least 1");
  const rows: T[] = [];
  let meta: Record<string, unknown> = {};
  let cursor: string | null | undefined = typeof query.cursor === "string" ? query.cursor : undefined;
  let pages = 0;
  do {
    const page: TopazApiOk<T[]> = await fetchV1<T[]>(path, { ...query, cursor }, options);
    if (!Array.isArray(page.data)) throw new Error(`${path} is not a paginated list route`);
    if (pages === 0) meta = page.meta;
    rows.push(...page.data);
    pages += 1;
    cursor = page.pageInfo?.hasNextPage ? page.pageInfo.nextCursor : null;
  } while (cursor && pages < maxPages);
  return { data: rows, meta, pages };
}
