# Topaz ID Connect

**Topaz ID** is the account and identity layer for the Topaz ecosystem on BNB
Chain. Users sign in with their existing Topaz ID account at
[`id.topazdex.com`](https://id.topazdex.com) — email, Google, or an external
wallet, no seed phrase, no extension — and your dApp connects to their Topaz ID
**smart contract wallet** (Kernel/ZeroDev), built on
[Privy global wallets](https://docs.privy.io/wallets/global-wallets/overview).

> **Read this first: Topaz ID is an ERC-4337 smart-contract (account-abstraction)
> wallet, not a plain EOA.** That one fact drives every gotcha below:
> - **Transactions are UserOperations.** Send them through the Topaz ID **action
>   client** (`useTopazIdClient` / `createTopazIdClient`), *not* plain
>   `writeContract`. Plain wagmi silently mis-encodes value-bearing calls.
> - **It's a brand-new address the user must fund.** The smart wallet is a
>   different address from the user's MetaMask/EOA — their existing BNB is not
>   there. Gas itself is sponsored by Topaz ID, so users need funds only for the
>   `value` they actually send.
> - **Signatures are ERC-1271/6492, not ECDSA.** Any backend that verifies wallet
>   ownership with `ecrecover` / `recoverMessageAddress` will silently fail. Use
>   viem's `verifyMessage` / `verifyTypedData` with a public client instead — see
>   [Signing messages](#signing-messages).

`@topazdex/id-connect` is the public NPM package that adds **"Connect with Topaz
ID"** to any dApp. Your app is just the *requester*: it references Topaz ID's
**public** Privy app id (shipped inside the package). You do **not** need a Privy
account of your own, and your domain does **not** need to be allowlisted by Topaz
ID.

- NPM: <https://www.npmjs.com/package/@topazdex/id-connect>
- Demo repo: <https://github.com/topazdex/topaz-id-connect-demo>
- Live demo: <https://topaz-id-demo.vercel.app> — connect, profile display,
  smart-wallet sends, and a batched approve + swap
- Profile host: <https://id.topazdex.com>

## How this relates to the rest of the skill

Topaz ID and the Topaz DEX protocol are **separate responsibilities**:

- **`@topazdex/id-connect` (this guide)** handles account/login/identity/signing
  UX — the wallet connection, the user's Topaz ID name/avatar, and the consent
  popup the user approves transactions through.
- **The Topaz protocol builders** (`scripts/src/lib/txBuilders.ts`,
  `actionBuilders.ts`, the `references/` docs, the Stats API) handle swaps,
  liquidity, gauges, veTOPAZ locks, votes, bribes, rewards, and analytics.

Most partner apps use **both**: Topaz ID Connect for who the user is and how they
sign, the protocol builders for what they sign. The connector gives you a wagmi
wallet; you build calldata with the protocol builders and submit it through the
Topaz ID action client (see [Sending transactions](#sending-transactions)) — see
also [`swap-calldata.md`](swap-calldata.md) and [`DEVELOPERS.md`](DEVELOPERS.md).

## Install

```bash
yarn add @topazdex/id-connect @privy-io/cross-app-connect wagmi viem \
  @tanstack/react-query
```

Add `@rainbow-me/rainbowkit` if you want the RainbowKit picker, or
`@privy-io/react-auth` if your app is itself a Privy app. All peer dependencies
are optional and only pulled in by the entrypoint that needs them (see
[Peer dependencies](#peer-dependencies)).

> Install the latest of each package. `@privy-io/cross-app-connect` peer-depends on
> an **exact** `viem` version, so if npm/yarn prints a `viem` peer-dependency
> warning, pin your `viem` to the version it requests (check its `peerDependencies`).

## Integration styles

The package supports four shapes. Pick the lightest one that fits the app. In
every case the connected account is the user's Topaz ID **smart contract wallet**
by default.

### 1. Minimal — `TopazIdProvider` + `useTopazIdLogin` (recommended)

The fastest path. One provider sets up wagmi (BNB Chain + the Topaz ID
connector) and React Query for you; one hook drives the consent popup. No
`createConfig`, no RainbowKit.

```tsx
// app/providers.tsx
"use client";
import { TopazIdProvider } from "@topazdex/id-connect/react";

export function Providers({
  children,
  cookie,
}: {
  children: React.ReactNode;
  cookie?: string | null;
}) {
  return <TopazIdProvider cookie={cookie}>{children}</TopazIdProvider>;
}
```

```tsx
// app/layout.tsx (Next.js App Router) — pass the request cookie for clean SSR
import { headers } from "next/headers";
import { Providers } from "./providers";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookie = (await headers()).get("cookie");
  return (
    <html lang="en">
      <body>
        <Providers cookie={cookie}>{children}</Providers>
      </body>
    </html>
  );
}
```

```tsx
// any client component
import { useTopazIdLogin } from "@topazdex/id-connect/react";
import { useAccount } from "wagmi";

export function SignIn() {
  const { login, logout, isPending } = useTopazIdLogin();
  const { address, isConnected } = useAccount();

  return isConnected ? (
    <button onClick={() => logout()}>{address}</button>
  ) : (
    <button onClick={() => login()} disabled={isPending}>
      Connect with Topaz ID
    </button>
  );
}
```

`TopazIdProvider` also accepts `appId` (target a staging app), `smartWalletMode`
(defaults to `true`; pass `false` only for the legacy signer-EOA — see
[Smart vs Legacy](#smart-vs-legacy)), `transport` (custom RPC), `queryClient`
(bring your own), `ssr` (defaults to `true`, enabling wagmi cookie storage), and
`cookie` (the request cookie header, so a connected wallet survives SSR without a
flash). Draw the `"use client"` boundary in your own app — the library stays
framework-agnostic.

### 2. RainbowKit picker — `topazIdWallet()`

Already using RainbowKit? Configure wagmi yourself and add Topaz ID as one wallet
in the picker. Connector helpers live at `@topazdex/id-connect/connectors`.

```ts
// lib/wagmi.ts
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { topazIdWallet, TOPAZ_ID_CHAIN } from "@topazdex/id-connect/connectors";
import { createConfig, http } from "wagmi";

const connectors = connectorsForWallets(
  [
    { groupName: "Sign in", wallets: [topazIdWallet()] },
    { groupName: "Other wallets", wallets: [walletConnectWallet] },
  ],
  {
    appName: "Your App",
    projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID!,
  },
);

export const wagmiConfig = createConfig({
  chains: [TOPAZ_ID_CHAIN], // BNB Chain (id 56)
  transports: { [TOPAZ_ID_CHAIN.id]: http() },
  connectors,
  ssr: true,
});
```

> RainbowKit's `connectorsForWallets` requires a WalletConnect (Reown) project id
> even though the Topaz ID connector uses its own popup flow and never touches
> WalletConnect. Get one free at [cloud.reown.com](https://cloud.reown.com).

> The `@topazdex/id-connect/rainbow-kit` subpath still works as a **deprecated
> alias** of `/connectors` so existing imports keep compiling. New code should
> import from `/connectors`.

### 3. Plain wagmi — `topazIdConnector()`

No RainbowKit, but you want to own the wagmi config:

```ts
import { topazIdConnector, TOPAZ_ID_CHAIN } from "@topazdex/id-connect/connectors";
import { createConfig, http } from "wagmi";

export const wagmiConfig = createConfig({
  chains: [TOPAZ_ID_CHAIN],
  transports: { [TOPAZ_ID_CHAIN.id]: http() },
  connectors: [topazIdConnector()],
  ssr: true,
});
```

### 4. Existing Privy apps — `/privy` cross-app login

If your app is **itself** a Privy app, skip the connector and add Topaz ID as a
cross-app login method using your **own** Privy app id:

```tsx
import {
  TopazIdPrivyProvider,
  topazIdLoginMethod,
  useTopazIdCrossAppLogin,
} from "@topazdex/id-connect/privy";

<TopazIdPrivyProvider
  appId={MY_PRIVY_APP_ID}
  config={{ loginMethodsAndOrder: { primary: ["email", "wallet"] } }}
>
  <App />
</TopazIdPrivyProvider>;

// trigger from a button
const { login } = useTopazIdCrossAppLogin();
```

Read the linked Topaz ID **smart wallet** address off the Privy user with
`useTopazIdAccount` — it returns the smart wallet as `address` (the identity to
display and look up) and the embedded signer EOA separately:

```ts
import { useTopazIdAccount } from "@topazdex/id-connect/privy";

const { address, signerAddress } = useTopazIdAccount();
// address       → the user's Topaz ID smart contract wallet (their identity)
// signerAddress → the embedded EOA that signs for it (signer-only)
```

`address` is `undefined` until the user's smart wallet is provisioned and linked,
so guard on it with a loading state before rendering or transacting.

## Profile identity

Topaz ID owns each wallet's name, handle, avatar, banner, and accent. Render real
identity instead of a bare `0x…`. Reads are **public, CORS-open, and
auth-free**.

The React Query hook lives at `/react`; framework-agnostic helpers live at the
root entry:

```tsx
import { displayNameForWallet, avatarForWallet } from "@topazdex/id-connect";
import { useTopazIdProfile } from "@topazdex/id-connect/react";
import { useAccount } from "wagmi";

function AccountIdentity() {
  const { address } = useAccount();
  const { data: profile, isLoading } = useTopazIdProfile(address);

  if (isLoading) return null;

  const label = displayNameForWallet(profile ?? null, address ?? "");
  const avatar = avatarForWallet(profile ?? null, "/default-avatar.png");

  return (
    <span>
      <img src={avatar} alt="" />
      {label}
    </span>
  );
}
```

`displayNameForWallet` already implements the right fallback order: `@handle` →
`name` → shortened address. `avatarForWallet` returns the profile image or your
`fallback`. Use `shortenAddress(wallet)` directly when you only need the address.

### Outside React

```ts
import { fetchTopazIdProfile } from "@topazdex/id-connect";

const profile = await fetchTopazIdProfile(wallet);
if (profile?.found) {
  // profile.handle / profile.name / profile.image …
}
```

`fetchTopazIdProfile` returns `null` on a network/HTTP failure; an `AbortSignal`
abort re-throws so a caller (e.g. React Query) can tell a cancellation from an
empty result. **Never block your UI on the fetch** — show the address first and
upgrade to the profile when it resolves.

### REST endpoint and profile shape

Under the hood the helpers call:

```http
GET https://id.topazdex.com/api/v1/profile/{wallet}
```

A wallet with no profile resolves to `{ found: false, … }` rather than a 404. The
returned `TopazIdProfile`:

| Field | Type | Notes |
| --- | --- | --- |
| `wallet` | `string` | Queried address |
| `found` | `boolean` | `false` → fall back to the address |
| `name` | `string \| null` | Display name |
| `description` | `string \| null` | Bio |
| `handle` | `string \| null` | `@handle`; preferred label |
| `image` | `string \| null` | Absolute avatar URL |
| `banner` | `string \| null` | Absolute banner URL |
| `accent` | `string \| null` | `"#rrggbb"` accent color |
| `theme` | `string` | Profile theme |
| `links` | `Record<string, unknown>?` | Social/external links |
| `showcase` | `Record<string, unknown>?` | Showcased items |
| `followers` / `following` | `number?` | Social counts |
| `updatedAt` | `string \| null` | Last profile update |

Link profile editing to <https://id.topazdex.com/settings>.

## Sending transactions

**Topaz ID is an ERC-4337 smart contract wallet, so transactions are
UserOperations — do not sign contract calls with plain wagmi
`writeContract`/`useWriteContract`.** Route them through the high-level Topaz ID
**action client** instead. It exposes `sendTransaction`, `sendCalls`,
`writeContract`, and `waitForReceipt`, and hides the smart-wallet details:
`privy_sendSmartWalletTx`, native BNB value formatting, approval+action batching,
and receipt polling.

In React, get the client from `useTopazIdClient`:

```tsx
import { useTopazIdClient } from "@topazdex/id-connect/react";
import { erc20Abi, parseEther, parseUnits } from "viem";

const { data: topazClient } = useTopazIdClient();

// single send with native BNB value
await topazClient?.sendTransaction({ to, value: parseEther("0.01") });

// a contract write
await topazClient?.writeContract({
  address: ROUTER_ADDRESS,
  abi: routerAbi,
  functionName: "swapExactTokensForTokens",
  args: [...],
});

// approve + action batched into ONE consent popup, executed atomically
await topazClient?.sendCalls({
  calls: [
    {
      address: TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [ROUTER_ADDRESS, parseUnits("100", 18)],
    },
    { to: ROUTER_ADDRESS, data: swapCalldata },
  ],
});
```

`useTopazIdClient` also returns `isTopazId`, and `data` stays `undefined` when the
connected wallet isn't Topaz ID — so in a multi-wallet dApp the drop-in pattern is
a single branch, no connector sniffing:

```ts
const { data: topazClient } = useTopazIdClient();

const hash = topazClient
  ? await topazClient.sendTransaction({ to, value }) // Topaz ID smart wallet
  : await sendTransactionAsync({ to, value, chainId: 56 }); // any other wallet
```

Pass `useTopazIdClient({ appId })` when your connector was configured with a
custom app id.

### Outside React

Framework-agnostic apps use the action client directly with any EIP-1193-ish
provider, from `@topazdex/id-connect/actions`:

```ts
import { createTopazIdClient } from "@topazdex/id-connect/actions";

const topazClient = await createTopazIdClient({ provider, account, chainId: 56 });
await topazClient.sendCalls({ calls: [approvalCall, swapCall] });
```

Plain object literals work for every call; the optional `txCall(...)` /
`contractCall(...)` builders do the same thing but validate the target address
eagerly, so a typo fails before a consent popup ever opens.

### Rules that keep sends reliable

- **Sign and send with this client (or plain wagmi for zero-value calls) — never
  `@privy-io/react-auth` signing hooks.** Those are embedded-wallet-only and
  execute from the underlying Privy EOA instead of the user's Topaz ID smart
  wallet. The client is the recommended path for **every** send; if a contract
  write reverts unexpectedly on plain wagmi, switch it to the client first.
- **Anything with native `value` must go through the client.** Pass `value` as a
  `bigint` and let the SDK format it — the popup expects a plain JSON number and
  rejects the hex quantity strings wagmi/viem emit. (That mismatch is exactly why
  value-bearing transactions fail with a "can't estimate cost" popup on raw
  connector integrations.) Above 2^53−1 wei (~0.009 BNB) the conversion can round
  by sub-1000-wei dust — negligible, and round amounts (0.1 / 1 / 10 BNB) are
  exact. Don't pre-encode `value` yourself.
- **Every action opens a Topaz ID consent window.** Trigger sends from a direct
  user interaction (a button click) so browsers don't block the popup — a send
  fired after a long `await` chain can be popup-blocked. Prefer batching an
  approval + action into one `sendCalls` bundle: one popup, one approval, atomic
  execution.
- **`sendCalls` degrades gracefully.** It submits one atomic bundle; if the wallet
  rejects the bundle it retries the calls sequentially (one consent popup per
  call) and returns the last call's hash. Pass `atomicRequired: true` to get the
  batch error instead of the fallback.
- **Treat receipt lookups as best-effort.** The returned hash is usually a
  transaction hash, but some smart-wallet flows return an id that
  `eth_getTransactionReceipt` cannot resolve. Use `topazClient.waitForReceipt(hash)`
  (or `waitForTopazIdReceipt({ provider, hash })` outside React) — it polls with a
  timeout and resolves to `null` instead of hanging. On `null`, fall back to
  re-reading your app state (balances, allowances) rather than blocking the UI.

### Keep the user as the final signer

**The user is always the final signer.** Do not give an agent unconstrained wallet
control. Topaz ID's consent popup keeps a human in the loop on every transaction;
preserve that — never design around it unless a future, explicitly bounded
session-key/policy system exists. For DeFi actions on Topaz DEX, build
deterministic calldata (see [`swap-calldata.md`](swap-calldata.md)), show a
confirmation screen with expected token deltas / slippage / risk, then submit
through the action client.

## Signing messages

Some flows need a **signed message** rather than a transaction — Sign-In With
Ethereum (SIWE) session auth, signing mint/launch metadata, agreeing to terms,
proving address ownership. Topaz ID supports this, but because the connected
account is a **smart contract wallet**, the signature is an **ERC-1271** (wallet
already deployed) or **ERC-6492** (wallet not yet deployed) contract signature —
**not** an ECDSA signature. Get this wrong and signing succeeds in the wallet
while every backend check fails. This is the single most common Topaz ID
integration snag.

> There is **no Topaz-ID-specific signing helper** — `useTopazIdClient` is
> transactions-only. Sign with the standard wagmi hooks. In smart-wallet mode the
> connector transparently rewrites `personal_sign` → `privy_signSmartWalletMessage`
> and `eth_signTypedData_v4` → `privy_signSmartWalletTypedData`, so
> `useSignMessage` / `useSignTypedData` return a signature bound to the
> **smart-wallet address** — the same address `useAccount()` gives you.

### One code path for Topaz ID and plain EOAs

You do **not** branch on wallet type. Sign with the standard wagmi hook and verify
with viem's signature verifiers — the same two calls cover a MetaMask EOA, a
deployed Topaz ID smart wallet, and a not-yet-deployed one.

**Client — produce the signature (identical for every wallet):**

```tsx
import { useSignMessage } from "wagmi";

function SignInButton({ message }: { message: string }) {
  const { signMessageAsync } = useSignMessage();

  async function signIn() {
    const signature = await signMessageAsync({ message });
    // POST { address, message, signature } to your backend to verify
  }

  return <button onClick={signIn}>Sign in</button>;
}
```

Use `useSignTypedData` the same way for EIP-712. Trigger the signature from a
direct user gesture — like sends, it opens the Topaz ID consent popup.

**Server — verify (the one rule that matters):** verify with viem's
`verifyMessage` / `verifyTypedData` against a BNB Chain public client. **Never
`ecrecover` / `recoverMessageAddress`.** viem's verifiers resolve EOAs by
`ecrecover`, deployed smart wallets by ERC-1271, and undeployed ones by ERC-6492 —
automatically, in one call:

```ts
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";

const publicClient = createPublicClient({ chain: bsc, transport: http() });

const valid = await publicClient.verifyMessage({ address, message, signature });
// verifyTypedData({ address, domain, types, primaryType, message, signature })
// for EIP-712.
```

`ecrecover` recovers *some* address from a Topaz ID signature, but never the
smart-wallet one — so an `ecrecover(sig) === address` check silently returns
`false` for every Topaz ID user while continuing to pass for EOAs. That asymmetry
is exactly what makes signing look wallet-specific when it should not be.

### Sign-In With Ethereum (SIWE)

The standard nonce → sign → verify flow is unchanged; swap only the verify step:

```ts
// 1. Server issues a nonce and stores it against the pending session.
// 2. Client builds the SIWE message and signs it with the SAME wagmi hook:
import { useSignMessage } from "wagmi";
const { signMessageAsync } = useSignMessage();
const signature = await signMessageAsync({ message: siweMessage });

// 3. Server verifies — viem is ERC-1271/6492-aware:
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
const publicClient = createPublicClient({ chain: bsc, transport: http() });
const ok = await publicClient.verifySiweMessage({ message: siweMessage, signature });
```

If you use the `siwe` package directly, its default in-process verification is
`ecrecover`-based and **rejects every smart-wallet login**. Either pass it a
viem/ethers provider so it runs the ERC-1271 path, or use viem's
`verifySiweMessage` (above), which handles EOA, ERC-1271, and ERC-6492 for you.

### Gotchas that bite

- **Signatures are variable-length.** ERC-1271 signatures are arbitrary-length and
  ERC-6492 ones are much longer than 65 bytes. Don't assume a 132-char / 65-byte
  signature, don't split into `r` / `s` / `v`, and size DB columns for a long (or
  `TEXT`) value.
- **A brand-new user's wallet may be undeployed.** If they sign before their first
  transaction, the smart wallet isn't on-chain yet and the signature is
  ERC-6492-wrapped. viem's verifiers handle it; a direct on-chain `isValidSignature`
  call does **not** (there's no contract at the address yet). Stick to
  `verifyMessage` / `verifyTypedData` / `verifySiweMessage`.
- **Verify against the smart-wallet address.** Pass the address from `useAccount()`
  (the smart wallet), not the `signerAddress` from `useTopazIdAccount()`.
- **Legacy mode and Privy's own hooks sign from the EOA.** In **Legacy** mode
  (`smartWalletMode: false`) the connector does *not* rewrite the sign methods, so
  you get a normal ECDSA signature from the signer EOA — verify it against that EOA,
  not a smart-wallet address. Likewise `@privy-io/react-auth`'s signing hooks
  execute from the embedded EOA; use wagmi's `useSignMessage` / `useSignTypedData`
  so the signature always matches the connected `useAccount()` address.

## Integration edge cases

Beyond the per-section notes above, these surprise first-time integrators. Treat
it as a pre-launch checklist:

- **BNB Chain only (id 56).** Topaz ID wallets operate solely on BNB Chain. There
  is no other chain to switch to — a `useSwitchChain` call to another network has
  no valid target, and all reads/writes must target chain 56. A multichain dApp
  should treat Topaz ID as the BNB Chain account and keep other networks on other
  connectors.
- **The smart wallet is a fresh address the user must fund.** It differs from the
  user's MetaMask/EOA, so their existing BNB isn't there. Gas is sponsored, so they
  need funds only for the `value` they actually send (see the intro callout).
- **`address` resolves asynchronously.** Right after login the smart-wallet address
  can be briefly `undefined` while it is provisioned and linked — guard on it before
  rendering identity or transacting, especially on the `/privy`
  `useTopazIdAccount` path.
- **Every consent action needs a user gesture.** Login, sends, and signing all open
  a Topaz ID popup, so fire them from a direct click — a call made after a long
  `await` chain gets popup-blocked. Embedded/in-app browsers (some mobile-wallet
  and messenger webviews) that block popups can't complete Topaz ID login; offer
  another connector as a fallback there.
- **Route value-bearing and contract calls through the action client**, not plain
  `writeContract` — see [Sending transactions](#sending-transactions).
- **Treat receipts as best-effort.** Some smart-wallet sends return an id
  `eth_getTransactionReceipt` never resolves; use `waitForReceipt` and fall back to
  re-reading app state — see [Sending transactions](#sending-transactions).

## Smart vs Legacy

Topaz ID has two wallet modes, labelled the same way as on id.topazdex.com:

- **Smart** — the user's smart contract wallet (Kernel/ZeroDev). The default, and
  the right choice for every new integration.
- **Legacy** — the underlying Privy **signer EOA**, exposed only for backward
  compatibility with dapps whose users transacted with that EOA directly before
  the smart-wallet cutover. That address is signer-only — not where the user holds
  funds.

**New integrations do nothing** — the connector defaults to Smart, and you
shouldn't surface Legacy at all. Only an existing dapp with users holding funds on
the signer EOA should offer both, via `{ smartWalletMode: false }` on
`topazIdConnector()` / `topazIdWallet()` / `TopazIdProvider`. When you show both,
label them `"Smart"` and `"Legacy"` — the canonical labels, descriptions, and a
`TopazIdWalletMode` type are exported (`TOPAZ_ID_WALLET_MODES`,
`topazIdWalletMode`, `TOPAZ_ID_SMART_WALLET_LABEL`, `TOPAZ_ID_LEGACY_WALLET_LABEL`)
so your toggle matches theirs.

## Exports

| Entry | Contents |
| --- | --- |
| `@topazdex/id-connect` | `TOPAZ_ID_APP_ID`, `TOPAZ_ID_CONNECTOR_ID`, `TOPAZ_ID_CHAIN_ID`, `TOPAZ_ID_NAME`, `TOPAZ_ID_ICON_URL`, `TOPAZ_ID_BASE_URL`, `TOPAZ_ID_SMART_WALLET_LABEL`, `TOPAZ_ID_LEGACY_WALLET_LABEL`, `TOPAZ_ID_WALLET_MODES`, `topazIdWalletMode`, `TopazIdWalletMode`, `TopazIdWalletModeInfo`, `fetchTopazIdProfile`, `displayNameForWallet`, `avatarForWallet`, `shortenAddress`, `TopazIdProfile` |
| `@topazdex/id-connect/connectors` | `topazIdWallet`, `topazIdConnector`, `TOPAZ_ID_CHAIN`, `TopazIdConnectorOptions` |
| `@topazdex/id-connect/actions` | `createTopazIdClient`, `waitForTopazIdReceipt`, `txCall`, `contractCall`, `isTopazIdConnectorId`, `TopazIdClient`, `TopazIdClientOptions`, `TopazIdCall`, `TopazIdContractCall`, `TopazIdSendCallsParameters`, `TopazIdCapabilities`, `TopazIdProviderLike`, `TopazIdTransactionReceipt`, `WaitForReceiptOptions`, `WaitForTopazIdReceiptParameters` |
| `@topazdex/id-connect/rainbow-kit` | *Deprecated alias of `/connectors`* |
| `@topazdex/id-connect/react` | `TopazIdProvider`, `useTopazIdLogin`, `useTopazIdClient`, `useTopazIdProfile` |
| `@topazdex/id-connect/privy` | `TopazIdPrivyProvider`, `useTopazIdCrossAppLogin`, `useTopazIdAccount`, `topazIdLoginMethod` |

## Peer dependencies

All peers are optional; install only what your entrypoints use.

| You use | Install |
| --- | --- |
| Profile helpers only (`@topazdex/id-connect`) | nothing extra |
| `TopazIdProvider` / `useTopazIdLogin` / `useTopazIdClient` (`/react`) | `wagmi`, `viem`, `@tanstack/react-query`, `react`, `@privy-io/cross-app-connect` |
| Connectors (`/connectors`) | `@privy-io/cross-app-connect`, `viem`, `wagmi` (+ `@rainbow-me/rainbowkit` for `topazIdWallet`) |
| Action client (`/actions`) | `viem` |
| `useTopazIdProfile` only (`/react`) | `@tanstack/react-query`, `react` |
| Privy cross-app (`/privy`) | `@privy-io/react-auth`, `react` |

## When to use this vs the protocol builders

Use `@topazdex/id-connect` for:

- login / connect UI and the Topaz ID wallet option
- user identity display (name, handle, avatar, banner)
- partner-app onboarding
- signing / sending through the Topaz ID consent flow (the action client)

Use the Topaz protocol builders / references for:

- swap quotes and swap calldata
- liquidity add/remove calldata, v3 position reads
- gauge staking, veTOPAZ locks/votes, bribes/rewards
- Stats API / subgraph analytics

When a user asks how a partner dApp can support Topaz login, account identity,
profile display, or a Topaz wallet option, recommend `@topazdex/id-connect` and
this guide **first** — not generic wagmi/RainbowKit/WalletConnect wiring on its
own. And when they ask how the connected Topaz ID wallet *sends* transactions,
point them at the action client (`useTopazIdClient` / `createTopazIdClient`) — not
plain `writeContract` — because Topaz ID is a smart contract wallet.
