// Calldata builders for the Topaz Relay depositor flow (managed veTOPAZ / mveTOPAZ).
// These never broadcast — they read the chain to validate, then return wallet-ready
// `{ to, data, value }`. The depositor operations target Topaz core (Voter /
// VotingEscrow / FreeManagedReward), not the relay contract itself.
//
// xTOPAZ spoke relays (below the BNB builders) target the chain's ManagedEscrow,
// RelayEntryZap and FreeManagedReward instead, and return the approvals still missing
// plus the call, like the Auto Manage builders.

import { Contract, Interface, ZeroAddress, getAddress } from "ethers";
import { ADDR } from "../config/addresses.js";
import { deployment } from "../config/deployments.js";
import { TOKENS } from "../config/tokens.js";
import { ABIS } from "./abis.js";
import { provider } from "./client.js";
import { canVoteNow, epochVoteEnd, epochVoteStart, fmtEpoch, nowSec } from "./epoch.js";
import { contractOnChain } from "./multichain.js";
import { encodePath } from "./path.js";
import { quoteV3Path } from "../read/quotes.js";
import {
  getSpokeRelayPosition,
  spokeEscrow,
  spokeRelayContract,
  type SpokeRelayPosition,
} from "../read/relays.js";
import {
  relayByMTokenId,
  requireDeployedSpokeRelay,
  resolveRelay,
  resolveSpokeRelay,
  spokeRelaysOnChain,
  type DeployedSpokeRelay,
  type RelayConfig,
  type SpokeZapRoute,
} from "../config/relays.js";

// VotingEscrow.escrowType values.
export const ESCROW_NORMAL = 0;
export const ESCROW_LOCKED = 1;
export const ESCROW_MANAGED = 2;

export interface BuiltRelayTx {
  to: string;
  data: string;
  value: bigint;
}

export interface BuiltDepositManagedTx {
  kind: "deposit-managed";
  tokenId: bigint;
  relay: RelayConfig;
  mTokenId: number;
  tx: BuiltRelayTx;
  builtAt: number;
}

export interface BuiltWithdrawManagedTx {
  kind: "withdraw-managed";
  tokenId: bigint;
  tx: BuiltRelayTx;
  builtAt: number;
}

export interface BuiltRelayClaimTx {
  kind: "relay-claim";
  tokenId: bigint;
  mTokenId: number;
  relay?: RelayConfig;
  freeManagedReward: string;
  payoutToken: string;
  earned: bigint;
  tx: BuiltRelayTx;
  builtAt: number;
}

export interface DepositManagedArgs {
  tokenId: string | number | bigint;
  /** "maxi" | "reward-distribute" | display name | relay address. */
  relay: string;
  /** Optional expected owner; if set, the builder fails on a mismatch. */
  owner?: string;
}

export interface WithdrawManagedArgs {
  tokenId: string | number | bigint;
  owner?: string;
}

export interface RelayClaimArgs {
  tokenId: string | number | bigint;
}

const voterIface = new Interface(ABIS.Voter);
const rewardIface = new Interface(ABIS.Reward);

const ve = (): Contract => new Contract(ADDR.VotingEscrow, ABIS.VotingEscrow, provider());
const voter = (): Contract => new Contract(ADDR.Voter, ABIS.Voter, provider());

function assertNotFinalHour(now: number): void {
  if (now > epochVoteEnd(now)) {
    throw new Error(
      "inside the final-hour window before the epoch flip — managed deposit/withdraw is restricted then; wait for the next epoch (Thursday 00:00 UTC)",
    );
  }
}

function assertOwner(expected: string | undefined, actual: string, tokenId: bigint): void {
  if (expected && getAddress(expected) !== getAddress(actual)) {
    throw new Error(`veNFT #${tokenId} is owned by ${actual}, not ${expected}`);
  }
}

/** Voter windows compare against block.timestamp, so use chain time rather than the local clock. */
async function chainNow(): Promise<number> {
  const block = await provider().getBlock("latest");
  return block ? block.timestamp : nowSec();
}

export async function buildDepositManagedTx(
  args: DepositManagedArgs,
): Promise<BuiltDepositManagedTx> {
  const relay = resolveRelay(args.relay);
  if (!relay) {
    throw new Error(
      `unknown relay "${args.relay}" — use "maxi", "reward-distribute", or a relay address`,
    );
  }
  const tokenId = BigInt(args.tokenId);
  const escrowContract = ve();
  const [escrow, lastVoted, owner] = await Promise.all([
    escrowContract.escrowType(tokenId) as Promise<bigint>,
    voter().lastVoted(tokenId) as Promise<bigint>,
    escrowContract.ownerOf(tokenId) as Promise<string>,
  ]);
  if (Number(escrow) !== ESCROW_NORMAL) {
    throw new Error(
      `veNFT #${tokenId} is not a NORMAL lock (escrowType=${escrow}) — only a normal veTOPAZ lock can be deposited into a relay`,
    );
  }
  assertOwner(args.owner, owner, tokenId);
  const now = await chainNow();
  if (!canVoteNow(lastVoted, now)) {
    throw new Error(
      `veNFT #${tokenId} already voted or deposited this epoch — depositManaged reverts until the next epoch`,
    );
  }
  assertNotFinalHour(now);

  const data = voterIface.encodeFunctionData("depositManaged", [tokenId, BigInt(relay.mTokenId)]);
  return {
    kind: "deposit-managed",
    tokenId,
    relay,
    mTokenId: relay.mTokenId,
    tx: { to: ADDR.Voter, data, value: 0n },
    builtAt: now,
  };
}

export async function buildWithdrawManagedTx(
  args: WithdrawManagedArgs,
): Promise<BuiltWithdrawManagedTx> {
  const tokenId = BigInt(args.tokenId);
  const escrowContract = ve();
  const [escrow, managedId, lastVoted, owner] = await Promise.all([
    escrowContract.escrowType(tokenId) as Promise<bigint>,
    escrowContract.idToManaged(tokenId) as Promise<bigint>,
    voter().lastVoted(tokenId) as Promise<bigint>,
    escrowContract.ownerOf(tokenId) as Promise<string>,
  ]);
  if (Number(escrow) !== ESCROW_LOCKED || managedId === 0n) {
    throw new Error(
      `veNFT #${tokenId} is not currently deposited in a managed lock (escrowType=${escrow}) — nothing to withdraw`,
    );
  }
  assertOwner(args.owner, owner, tokenId);
  const now = await chainNow();
  if (!canVoteNow(lastVoted, now)) {
    throw new Error(
      `veNFT #${tokenId} cannot be withdrawn in the same epoch it was deposited or voted — wait for the next epoch`,
    );
  }
  assertNotFinalHour(now);

  const data = voterIface.encodeFunctionData("withdrawManaged", [tokenId]);
  return {
    kind: "withdraw-managed",
    tokenId,
    tx: { to: ADDR.Voter, data, value: 0n },
    builtAt: now,
  };
}

export async function buildRelayClaimTx(args: RelayClaimArgs): Promise<BuiltRelayClaimTx> {
  const tokenId = BigInt(args.tokenId);
  const escrowContract = ve();
  const managedId = (await escrowContract.idToManaged(tokenId)) as bigint;
  if (managedId === 0n) {
    throw new Error(`veNFT #${tokenId} is not deposited into any managed lock — nothing to claim`);
  }
  const relay = relayByMTokenId(managedId);
  if (relay && !relay.hasUserClaim) {
    throw new Error(
      `${relay.displayName} compounds rewards in-place into the lock — there is nothing to claim; withdraw the veNFT to realize the gains`,
    );
  }
  const freeManagedReward = (await escrowContract.managedToFree(managedId)) as string;
  if (freeManagedReward === ZeroAddress) {
    throw new Error(`managed lock #${managedId} has no FreeManagedReward contract`);
  }
  const payoutToken = relay?.payoutToken ?? TOKENS.USDT.address;
  const reward = new Contract(freeManagedReward, ABIS.Reward, provider());
  const earned = (await reward.earned(payoutToken, tokenId)) as bigint;
  if (earned === 0n) {
    throw new Error(
      `nothing claimable for veNFT #${tokenId} (0 ${relay?.payoutSymbol ?? "reward token"})`,
    );
  }
  const data = rewardIface.encodeFunctionData("getReward", [tokenId, [payoutToken]]);
  return {
    kind: "relay-claim",
    tokenId,
    mTokenId: Number(managedId),
    relay,
    freeManagedReward,
    payoutToken,
    earned,
    tx: { to: freeManagedReward, data, value: 0n },
    builtAt: nowSec(),
  };
}

// ---------------------------------------------------------------------------
// xTOPAZ spoke relays
// ---------------------------------------------------------------------------

const BPS = 10_000n;
const DEFAULT_SPOKE_SLIPPAGE_BPS = 100;
const SPOKE_ZAP_DEADLINE_SECONDS = 600;

export interface BuiltSpokeRelayTx {
  chainId: number;
  to: string;
  data: string;
  value: bigint;
  label: string;
}

export interface BuiltSpokeRelayAction {
  kind: "spoke-deposit" | "spoke-zap" | "spoke-withdraw" | "spoke-claim-deferred" | "spoke-claim";
  chainId: number;
  relay: DeployedSpokeRelay;
  /** Approvals the owner must confirm first; empty when allowances already cover the call. */
  approvals: BuiltSpokeRelayTx[];
  tx: BuiltSpokeRelayTx;
  /** Raw amounts and timing for display. */
  details: Record<string, unknown>;
  /** Chain time the gates were checked against. */
  builtAt: number;
}

interface SpokeRelayTarget {
  chainId: number;
  /** "maxi" | "converter" | on-chain name | relay address. */
  relay: string;
  owner: string;
}

const erc20Iface = new Interface(ABIS.ERC20);

/** Unknown selectors and relays without a recorded deployment fail before any RPC call. */
export function openSpokeRelay(chainId: number, selector: string): DeployedSpokeRelay {
  const relay = resolveSpokeRelay(selector, chainId);
  if (!relay) {
    const known = spokeRelaysOnChain(chainId).map((r) => `"${r.type}" (${r.displayName})`).join(", ");
    if (!known) throw new Error(`${deployment(chainId).name} (${chainId}) has no xTOPAZ spoke relays`);
    throw new Error(`unknown relay "${selector}" on ${deployment(chainId).name} — use ${known} or a relay address`);
  }
  return requireDeployedSpokeRelay(relay);
}

/** ManagedEscrow windows compare against block.timestamp. */
async function spokeChainNow(chainId: number): Promise<number> {
  const block = await provider(chainId).getBlock("latest");
  if (!block) throw new Error("could not read the latest block");
  return block.timestamp;
}

/** depositManaged reverts with DistributeWindow in the first hour and SpecialVotingWindow in the last. */
export function spokeDepositBlocker(now: number): string | null {
  if (now <= epochVoteStart(now)) {
    return `spoke relay deposits are closed in the first hour of the epoch (Thursday 00:00–01:00 UTC); they reopen at ${fmtEpoch(epochVoteStart(now) + 1)}`;
  }
  if (now > epochVoteEnd(now)) {
    return "spoke relay deposits are closed from Wednesday 23:00 UTC until the epoch flip; they reopen Thursday 01:00 UTC";
  }
  return null;
}

/** withdrawManaged and claimDeferred revert with DistributeWindow only in the first hour. */
export function spokeExitBlocker(now: number): string | null {
  if (now <= epochVoteStart(now)) {
    return `spoke relay exits are closed in the first hour of the epoch (Thursday 00:00–01:00 UTC); they reopen at ${fmtEpoch(epochVoteStart(now) + 1)}`;
  }
  return null;
}

function checkSpokeSlippage(bps: number): void {
  if (!Number.isInteger(bps) || bps < 1 || bps > 1_000) throw new Error("slippageBps must be an integer from 1 to 1000");
}

async function requireTokenBalance(chainId: number, owner: string, token: string, need: bigint, symbol: string): Promise<void> {
  const balance = (await new Contract(token, ABIS.ERC20, provider(chainId)).balanceOf(owner)) as bigint;
  if (balance < need) throw new Error(`Insufficient ${symbol}: have ${balance}, need ${need} (raw units)`);
}

async function approvalIfShort(
  chainId: number,
  owner: string,
  token: string,
  spender: string,
  amount: bigint,
  symbol: string,
): Promise<BuiltSpokeRelayTx[]> {
  const current = (await new Contract(token, ABIS.ERC20, provider(chainId)).allowance(owner, spender)) as bigint;
  if (current >= amount) return [];
  return [{
    chainId,
    to: getAddress(token),
    data: erc20Iface.encodeFunctionData("approve", [spender, amount]),
    value: 0n,
    label: `Approve ${symbol}`,
  }];
}

/** Gates shared by direct deposits and zaps: relay active and window open. */
async function spokeDepositGates(relay: DeployedSpokeRelay) {
  const escrow = spokeEscrow(relay);
  const [deactivated, now] = await Promise.all([
    escrow.deactivated(BigInt(relay.mTokenId)) as Promise<boolean>,
    spokeChainNow(relay.chainId),
  ]);
  if (deactivated) throw new Error(`${relay.displayName} on ${deployment(relay.chainId).name} is deactivated and takes no deposits; exits stay open`);
  const blocker = spokeDepositBlocker(now);
  if (blocker) throw new Error(blocker);
  const unlockAt = (await contractOnChain(relay.chainId, "XTopazVotingVault", provider(relay.chainId)).lockUntil()) as bigint;
  return { now, unlockAt };
}

export interface SpokeRelayDepositArgs extends SpokeRelayTarget {
  /** Raw xTOPAZ (18 decimals). */
  amount: bigint;
}

/** Approve xTOPAZ to the escrow, then ManagedEscrow.depositManaged(mTokenId, amount). */
export async function buildSpokeRelayDepositTx(args: SpokeRelayDepositArgs): Promise<BuiltSpokeRelayAction> {
  const relay = openSpokeRelay(args.chainId, args.relay);
  const owner = getAddress(args.owner);
  if (args.amount <= 0n) throw new Error("amount must be positive");
  const { now, unlockAt } = await spokeDepositGates(relay);
  await requireTokenBalance(relay.chainId, owner, relay.xTopaz, args.amount, "xTOPAZ");
  const approvals = await approvalIfShort(relay.chainId, owner, relay.xTopaz, relay.escrow, args.amount, "xTOPAZ");
  const escrow = spokeEscrow(relay);
  return {
    kind: "spoke-deposit",
    chainId: relay.chainId,
    relay,
    approvals,
    tx: {
      chainId: relay.chainId,
      to: relay.escrow,
      data: escrow.interface.encodeFunctionData("depositManaged", [BigInt(relay.mTokenId), args.amount]),
      value: 0n,
      label: `Deposit xTOPAZ into ${relay.displayName}`,
    },
    details: { amount: args.amount, unlockAt: Number(unlockAt), unlockAtUtc: fmtEpoch(Number(unlockAt)) },
    builtAt: now,
  };
}

export interface SpokeRelayZapArgs extends SpokeRelayTarget {
  /** ERC20 to pay with, or null for the chain's native ETH (refused on Arc). */
  tokenIn: string | null;
  amountIn: bigint;
  slippageBps?: number;
  /** Overrides the configured route; must start at tokenIn (WETH for native) and end at xTOPAZ. */
  path?: { tokens: string[]; tickSpacings: number[] };
}

interface ResolvedZapRoute {
  tokens: string[];
  tickSpacings: number[];
  symbol: string | undefined;
}

function zapRoute(
  relay: DeployedSpokeRelay,
  tokenIn: string | null,
  override?: { tokens: string[]; tickSpacings: number[] },
): ResolvedZapRoute {
  const chain = deployment(relay.chainId);
  if (tokenIn === null && !chain.wrappedNative) {
    throw new Error(`${chain.name} has no native leg for relay entry; zap the USDC ERC20 with zapInToken instead`);
  }
  const configured: SpokeZapRoute | undefined = relay.zapRoutes.find((r) =>
    tokenIn === null ? r.tokenIn === "native" : r.tokenIn !== "native" && getAddress(r.tokenIn) === getAddress(tokenIn),
  );
  const route = override ? { ...override, symbol: configured?.symbol } : configured;
  if (!route) {
    const known = relay.zapRoutes.map((r) => r.symbol).join(", ") || "none yet";
    throw new Error(`no configured zap route from ${tokenIn ?? chain.nativeSymbol} into xTOPAZ on ${chain.name} (configured: ${known}); pass an explicit path`);
  }
  const tokens = route.tokens.map((t) => getAddress(t));
  const first = tokenIn === null ? getAddress(chain.wrappedNative as string) : getAddress(tokenIn);
  if (tokens[0] !== first || tokens[tokens.length - 1] !== getAddress(relay.xTopaz)) {
    throw new Error(`zap path must start at ${first} and end at xTOPAZ ${relay.xTopaz}`);
  }
  return { tokens, tickSpacings: route.tickSpacings, symbol: route.symbol };
}

/**
 * RelayEntryZap.zapInETH(mTokenId, path, minOut, deadline) with value, or
 * zapInToken(mTokenId, tokenIn, amountIn, path, minOut, deadline) after approving tokenIn
 * to the zap. minOut is the QuoterV2 quote less slippage; xTOPAZ itself goes in with an
 * empty path and minOut = amountIn. Every zap carries a deadline from chain time.
 */
export async function buildSpokeRelayZapTx(args: SpokeRelayZapArgs): Promise<BuiltSpokeRelayAction> {
  const relay = openSpokeRelay(args.chainId, args.relay);
  const owner = getAddress(args.owner);
  const bps = args.slippageBps ?? DEFAULT_SPOKE_SLIPPAGE_BPS;
  checkSpokeSlippage(bps);
  if (args.amountIn <= 0n) throw new Error("amountIn must be positive");
  if (!relay.zap) throw new Error(`${deployment(relay.chainId).name} has no RelayEntryZap recorded`);
  const native = args.tokenIn === null;
  // xTOPAZ in takes no swap: the zap requires an empty path and a nonzero minimum no larger than the amount.
  const direct = args.tokenIn !== null && getAddress(args.tokenIn) === relay.xTopaz;
  const route: ResolvedZapRoute = direct
    ? { tokens: [relay.xTopaz], tickSpacings: [], symbol: "xTOPAZ" }
    : zapRoute(relay, args.tokenIn, args.path);
  const path = direct ? "0x" : encodePath(route.tokens, route.tickSpacings);

  const quoted = direct ? args.amountIn : await quoteV3Path(path, args.amountIn, relay.chainId);
  if (quoted === 0n) throw new Error("the zap route returned no quote; the pool may be missing or too shallow");
  const minOut = direct ? args.amountIn : (quoted * (BPS - BigInt(bps))) / BPS;
  const { now, unlockAt } = await spokeDepositGates(relay);

  let approvals: BuiltSpokeRelayTx[] = [];
  if (native) {
    const balance = await provider(relay.chainId).getBalance(owner);
    if (balance < args.amountIn) throw new Error(`Insufficient native balance: have ${balance}, need ${args.amountIn}`);
  } else {
    const symbol = route.symbol ?? "input token";
    await requireTokenBalance(relay.chainId, owner, route.tokens[0], args.amountIn, symbol);
    approvals = await approvalIfShort(relay.chainId, owner, route.tokens[0], relay.zap, args.amountIn, symbol);
  }

  const zap = spokeRelayContract(relay.chainId, "RelayEntryZap", relay.zap);
  const mTokenId = BigInt(relay.mTokenId);
  const deadline = BigInt(now + SPOKE_ZAP_DEADLINE_SECONDS);
  const data = native
    ? zap.interface.encodeFunctionData("zapInETH", [mTokenId, path, minOut, deadline])
    : zap.interface.encodeFunctionData("zapInToken", [mTokenId, route.tokens[0], args.amountIn, path, minOut, deadline]);
  return {
    kind: "spoke-zap",
    chainId: relay.chainId,
    relay,
    approvals,
    tx: {
      chainId: relay.chainId,
      to: getAddress(relay.zap),
      data,
      value: native ? args.amountIn : 0n,
      label: `Zap ${native ? deployment(relay.chainId).nativeSymbol : (route.symbol ?? "tokens")} into ${relay.displayName}`,
    },
    details: {
      native,
      tokenIn: native ? null : route.tokens[0],
      amountIn: args.amountIn,
      path: { tokens: route.tokens, tickSpacings: route.tickSpacings },
      quotedXTopaz: quoted,
      minXTopaz: minOut,
      deadline,
      unlockAt: Number(unlockAt),
      unlockAtUtc: fmtEpoch(Number(unlockAt)),
    },
    builtAt: now,
  };
}

async function requirePosition(relay: DeployedSpokeRelay, owner: string): Promise<SpokeRelayPosition> {
  const position = await getSpokeRelayPosition(relay, owner);
  if (!position) throw new Error(`${owner} has no deposit in ${relay.displayName} on ${deployment(relay.chainId).name}`);
  return position;
}

export interface SpokeRelayWithdrawArgs extends SpokeRelayTarget {
  /** Sender when it is not the owner: an `isApprovedForAll` operator. The owner is still paid. */
  caller?: string;
}

/**
 * ManagedEscrow.withdrawManaged(depositId): full exit, paid to the owner as liquid xTOPAZ
 * (weight plus compounded xTOPAZ plus anything previously deferred). Any part the matured
 * lots cannot cover is recorded as deferred and paid later by claimDeferred.
 */
export async function buildSpokeRelayWithdrawTx(args: SpokeRelayWithdrawArgs): Promise<BuiltSpokeRelayAction> {
  const relay = openSpokeRelay(args.chainId, args.relay);
  const owner = getAddress(args.owner);
  const caller = getAddress(args.caller ?? owner);
  if (caller !== owner && !((await spokeEscrow(relay).isApprovedForAll(owner, caller)) as boolean)) {
    throw new Error(`${caller} is neither the owner nor an approved operator of ${owner} on the ${relay.displayName} escrow`);
  }
  const position = await requirePosition(relay, owner);
  if (!position.active) {
    const hint = position.deferred > 0n ? "; it has deferred xTOPAZ, so build claimDeferred instead" : "";
    throw new Error(`deposit #${position.depositId} has already exited ${relay.displayName}${hint}`);
  }
  const escrow = spokeEscrow(relay);
  const [now, withdrawable] = await Promise.all([
    spokeChainNow(relay.chainId),
    escrow.withdrawable(BigInt(relay.mTokenId)) as Promise<bigint>,
  ]);
  if (now < position.unlockAt) {
    throw new Error(`deposit #${position.depositId} is locked until ${fmtEpoch(position.unlockAt)} (every deposit relocks it to the start of epoch N+2)`);
  }
  const blocker = spokeExitBlocker(now);
  if (blocker) throw new Error(blocker);
  const owed = position.weight + position.earnedXTopaz + position.deferred;
  const expectedDeferred = owed > withdrawable ? owed - withdrawable : 0n;
  return {
    kind: "spoke-withdraw",
    chainId: relay.chainId,
    relay,
    approvals: [],
    tx: {
      chainId: relay.chainId,
      to: relay.escrow,
      data: escrow.interface.encodeFunctionData("withdrawManaged", [position.depositId]),
      value: 0n,
      label: `Exit ${relay.displayName}`,
    },
    details: {
      depositId: position.depositId,
      weight: position.weight,
      earnedXTopaz: position.earnedXTopaz,
      previouslyDeferred: position.deferred,
      caller,
      owed,
      expectedDeferred,
      freeRewardsStillClaimable: position.freeRewards,
    },
    builtAt: now,
  };
}

/** ManagedEscrow.claimDeferred(depositId): pays the owner whatever matured lots now cover. */
export async function buildSpokeRelayClaimDeferredTx(args: SpokeRelayTarget): Promise<BuiltSpokeRelayAction> {
  const relay = openSpokeRelay(args.chainId, args.relay);
  const owner = getAddress(args.owner);
  const position = await requirePosition(relay, owner);
  if (position.deferred === 0n) throw new Error(`deposit #${position.depositId} has no deferred xTOPAZ`);
  const escrow = spokeEscrow(relay);
  const [now, withdrawable] = await Promise.all([
    spokeChainNow(relay.chainId),
    escrow.withdrawable(BigInt(relay.mTokenId)) as Promise<bigint>,
  ]);
  const blocker = spokeExitBlocker(now);
  if (blocker) throw new Error(blocker);
  if (withdrawable === 0n) {
    throw new Error(`no matured xTOPAZ in ${relay.displayName} can pay the deferred amount yet; retry after the next lot matures`);
  }
  return {
    kind: "spoke-claim-deferred",
    chainId: relay.chainId,
    relay,
    approvals: [],
    tx: {
      chainId: relay.chainId,
      to: relay.escrow,
      data: escrow.interface.encodeFunctionData("claimDeferred", [position.depositId]),
      value: 0n,
      label: `Claim deferred xTOPAZ from ${relay.displayName}`,
    },
    details: {
      depositId: position.depositId,
      deferred: position.deferred,
      expectedPaid: position.deferred < withdrawable ? position.deferred : withdrawable,
    },
    builtAt: now,
  };
}

export interface SpokeRelayClaimArgs extends SpokeRelayTarget {
  /** Restrict to these reward tokens; default every token with earned > 0. */
  tokens?: string[];
}

/** FreeManagedReward.getReward(depositId, tokens). Works before or after exit; never gated by windows. */
export async function buildSpokeRelayClaimTx(args: SpokeRelayClaimArgs): Promise<BuiltSpokeRelayAction> {
  const relay = openSpokeRelay(args.chainId, args.relay);
  const owner = getAddress(args.owner);
  const position = await requirePosition(relay, owner);
  const wanted = args.tokens?.map((t) => getAddress(t));
  const rewards = position.freeRewards.filter((r) => !wanted || wanted.includes(r.token));
  if (rewards.length === 0) {
    const hint = relay.hasUserClaim ? "" : `; ${relay.displayName} compounds into xTOPAZ, which is paid on exit`;
    throw new Error(`nothing claimable for deposit #${position.depositId} in ${relay.displayName}${hint}`);
  }
  const reward = spokeRelayContract(relay.chainId, "FreeManagedReward", relay.freeManagedReward);
  const tokens = rewards.map((r) => r.token);
  return {
    kind: "spoke-claim",
    chainId: relay.chainId,
    relay,
    approvals: [],
    tx: {
      chainId: relay.chainId,
      to: getAddress(relay.freeManagedReward),
      data: reward.interface.encodeFunctionData("getReward", [position.depositId, tokens]),
      value: 0n,
      label: `Claim ${relay.displayName} rewards`,
    },
    details: { depositId: position.depositId, rewards },
    builtAt: await spokeChainNow(relay.chainId),
  };
}

/** eth_call the built transaction from `from`; resolves on success, throws the revert otherwise. */
export async function simulateSpokeRelayTx(tx: BuiltSpokeRelayTx, from: string): Promise<void> {
  await provider(tx.chainId).call({ from, to: tx.to, data: tx.data, value: tx.value });
}
