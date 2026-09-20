# Bridge xTOPAZ through BNB

Use this for **xTOPAZ shares through LayerZero**, not arbitrary-token cross-chain swaps. See [website.md](website.md) for the distinct 0x and privacy journeys. Select addresses/ABIs from [deployments.json](deployments.json), and begin with [multichain.md](multichain.md).

## Before a send

1. Resolve the user's account, source/destination EVM IDs, intended beneficiary, amount, and plain/stake/redeem mode. A spoke can send only to BNB EID 30102; BNB can send to the four documented spoke EIDs. Spoke-to-spoke requires a completed BNB leg before preparing the second leg.
2. Verify RPC `eth_chainId` on both sides, deployed code, OFT `token()` / adapter token binding, both `peers(remoteEid)` values and the destination composer's local `OAPP` binding. Check hub `routePaused(spokeEid)`, spoke pause, and source outbound/destination inbound capacity. Read `inboundAvailable(spokeEid)` on the BNB adapter before any return. Do not hardcode the launch limit of 500,000 shares/day.
3. Read source liquid balance, token decimals (18), `sharedDecimals()` (6) and `decimalConversionRate()` (normally `1e12`). `amountSent = floor(amountLD/rate)*rate`; reject zero. Explain the dust and actual transferable amount. Read any destination stake/unwrap gates; the optional action may fall back.
4. Quote native messaging fee with the exact recipient, compose payload and options. Check native gas balance for fee **plus** source execution gas. A fee quote is not a lock on future fees.
5. Build approvals for the actual spender, wait for authorized approval receipts, reread and simulate the send from the actual payer. Capture chain IDs, amount sent, dust, recipient, calldata, native fee, source hash and LayerZero GUID. On uncertain submission, recover the existing hash rather than sending again.

## BNB → spoke: preferred WrapRouter path

For held shares, approve **XTopaz to WrapRouter**, then:

```text
b = { dstEid: destination LayerZero EID,
      receiver: beneficiary address,
      composer: zero address OR destination SpokeStakeComposer }
(nativeFee, amountSent) = WrapRouter.quoteBridge(amountLD,b)
WrapRouter.bridge(amountLD,b) with value = nativeFee
```

Zero composer delivers liquid xTOPAZ directly. A destination SpokeStakeComposer opens a new stake for `receiver`, or delivers liquid shares if staking fails. The router constructs the canonical beneficiary payload and refunds subprecision dust to the source caller. Never use SpokeBudgetComposer for a user transfer: it authenticates protocol budget messages.

Combined source methods are `depositTopazAndBridge(amount,b)`, `wrapVeAndBridge(tokenId,claims,b)` and the XTopazZap bridge variants. Approval is to the selected entry contract for its **input** asset; do not approve xTOPAZ when depositing TOPAZ. Combined flows bridge actual minted shares, not an estimated deposit amount. See [xtopaz-vault.md](xtopaz-vault.md).

## Direct OFT send, including spoke → BNB

Call the source `XTopazOFT` on a spoke, or `XTopazOFTAdapter` on BNB. The BNB adapter needs canonical XTopaz allowance. A spoke OFT burns the caller's shares directly; inspect `approvalRequired()` rather than inventing self-approval.

```text
SendParam = {
  dstEid: remote LayerZero EID,
  to: beneficiary padded on the left to bytes32 (plain), OR destination composer padded to bytes32,
  amountLD: raw 18-decimal shares,
  minAmountLD: dust-trimmed amount expected to arrive,
  extraOptions: "0x",  // only after verifying enforced options for this route/message type
  composeMsg: "0x" (plain), OR abi.encode(address beneficiary),
  oftCmd: "0x"
}
fee = sourceOFT.quoteSend(SendParam,false)
sourceOFT.send(SendParam,fee,refundAddress) with value = fee.nativeFee
```

Use `quoteOFT(SendParam)` to check limits and actual sent/received amounts when available. Keep the same SendParam for quote and send, and pay in native currency (`false` means no LZ-token payment). Do not fabricate options bytes; inspect `enforcedOptions(dstEid,messageType)` or use the documented LayerZero options encoder if additional gas is needed. Message type 1 is send; type 2 is send-and-call. Official routes configure receive/compose gas, but governance can change it.

For **bridge back and redeem**, set BNB `HubUnwrapComposer` as `to` and `abi.encode(receiver)` as composeMsg. Success produces a new permanent BNB veNFT. If redemption is closed or fails, the beneficiary receives liquid BNB xTOPAZ instead. Never target a composer with an empty payload: that queues no compose and can strand funds pending owner rescue. Never encode a packed 20-byte address in place of the canonical 32-byte ABI address word.

On Arc, OFT sends still pay native USDC fees in **18-decimal units**, although trading USDC via ERC20 uses six. The token-only restriction concerns DEX router native legs, not LayerZero messaging fees.

## Completion, fallback and recovery

Source success means the packet was sent, not that destination work succeeded. Decode `OFTSent` / `Bridged` for GUID and actual debit, and correlate destination `OFTReceived`. Then check `Staked` / `PositionOpened`, `Unwrapped` / `Redeemed`, or `FallbackDelivered`. A fallback is completed **token delivery**, not successful staking/redemption and not lost funds.

Use [LayerZero Scan](https://layerzeroscan.com) and `GET https://api.topazdex.com/v1/bridge/{guid}`. Retain source chain/hash even if an app feature is later hidden. Missing indexed data is not evidence of failed delivery; inspect RPC receipts/events and the endpoint packet state.

| Observed state | Next step |
|---|---|
| Source hash pending/unknown | Query that hash/account nonce; do not blindly resubmit |
| Receive pending due to route pause/rate limit | Wait for route/capacity recovery; retry the **existing** LayerZero packet |
| Received, compose pending | Inspect compose failure and gas; retry existing compose with appropriate gas |
| FallbackDelivered | Show liquid xTOPAZ on destination; offer a separate stake/redeem after fresh checks |
| SupplyUnderflow on hub receive | Stop automated recovery; requires investigation and authorized administrative reconciliation |
| Plain transfer to composer | Owner rescue may be necessary; do not promise permissionless recovery |

LayerZero endpoint retries require the actual packet/compose parameters and current endpoint state. Prefer the scanner's existing-message recovery UI; do not invent `lzReceive`/`lzCompose` arguments, claim a retry guarantees success, or send a new bridge transaction as a substitute. Keeper budget retries and user sends are different workflows.
