# AI Wallet and agent service review — 2026-09-20

The review changes were released on 2026-09-20 after explicit user authorization. Service v0.20.0 (`b71eedd`) is deployed on Fly; AI Wallet `706ad35` is deployed on Vercel. The agent registration update is confirmed on BNB. No user-position transaction was signed or broadcast.

## Scope and source reconciliation

Reviewed the service's prompts, tool surfaces, MCP, wallet context parser and API integration; the wallet's chat hydration, semantic resolution, CL rebalance planning, compilation, simulation handoff, HTTP error handling and BNB chain restrictions. Cross-checked skill 3.1.0, the multichain contract integration guide/decisions, the public API OpenAPI contract and the replacement website's navigation/data conventions.

Both checkouts were behind upstream. Fast-forwarded the service from `386b449` to `abac69d` (0.19.3), and the wallet from `42b9f0b` to `15a0c94`, preserving the review changes. These upstream commits already move legacy stats reads to `api.topazdex.com`; this review does not claim that host migration as a new fix. Existing uncommitted work in `topaz-api` was preserved. No contract or replacement-website source was changed.

## Findings and changes

| Finding | Change |
| --- | --- |
| Service research and prompts described Topaz as BNB-only. Wallet had a separate prompt, so changing public chat alone would not fix it. | Shared five-chain policy on every agent surface; two read-only tools exposed to public chat, Telegram, authenticated research, wallet proposal turns and MCP. |
| Updated skill was not loaded by the hosted agent. | Bundle 42 topics covering the skill overview and all Markdown reference/developer guides, with skill version and source commit links. `scripts/sync-topaz-guides.mjs` makes subsequent reviewed updates repeatable. |
| No chain-qualified live research capability. | Fixed-origin `/v1` GET tool covering the inspected public read routes, including markets, tokens, prices, accounts, voting, xTOPAZ and bridge state. Bounded calls/row limits, opaque cursors, chain validation and full availability envelopes. No POST, invalidation, calldata or execution capability. |
| Explicit non-BNB wallet context could be ignored; the UI compilation helper overwrote any intent chain with 56. | Reject explicit non-BNB contexts/intents before proposal handling or compilation. Existing execution intent schemas still require chain 56. Legacy clients that omit chain remain compatible. |
| `readStaked` caught an RPC failure and returned false. Rebalance could omit unstaking a gauge-held NFT and later fail. | Propagate the failed read; verified unstaked positions still work. Shared exit/claim/increase planning also benefits from this correction. |
| New ranges clamped to raw TickMath limits rather than valid spacing multiples. | Clamp zap/rebalance ranges to usable ticks. Regression coverage includes both extremes and all five supported BNB tick spacings. |
| Chat allowed a 60-second agent call inside a 60-second route that also hydrates context/resolves actions. Compilation routes allowed only 30 seconds. | Chat 120s; single bundle 60s; batch and resolve-and-compile 120s. Stats requests have a 10s abort. These settings require the hosting platform to honor the budgets; they do not guarantee RPC/LLM completion. |
| HTML/empty gateway errors produced JSON parse errors, hiding the failed stage. | Display endpoint and HTTP status, with a readable timeout message and bounded structured backend error text. No automatic transaction retries. |
| Rebalance prompt overstated compounding of non-pair reward tokens. | Explain that pair-token emissions are folded in and other reward tokens return to the owner. |

Service release metadata is prepared as 0.20.0 / tools 3.6.0, with separate research and execution chain lists. The account, connector registry and on-chain connectors are unchanged.

## Verification

- Agent service: 494 tests pass across 56 files; TypeScript and production build pass.
- AI Wallet: 527 tests pass, six existing tests skipped, across 52 passing and five skipped files; TypeScript, ESLint and Next.js production build pass.
- Wallet test command on this machine: `NODE_OPTIONS=--no-experimental-webstorage yarn test`. Node 26's experimental server storage conflicts with jsdom browser storage and causes seven pre-existing component failures without the flag. CI specifies Node 22. No tests were removed or skipped to obtain the passing result.
- Restored service dependencies with `yarn install --immutable`: installed `node_modules` had AI SDK 6 despite the repo/lockfile requiring SDK 7. No dependency-version change was introduced.
- Public read smoke checks on 2026-09-20 UTC: service health and wallet HTML respond; canonical and legacy Stats protocol routes respond; `/v1/chains`, `/v1/deployments`, `/v1/xtopaz`, `/v1/quote-providers` respond successfully. Pool reads explicitly select all five networks and preserve returned chain identities.
- Base, Ethereum and Arc returned empty **curated** pool lists at the inspection time. Rechecking those same chains with `scope=all` returned indexed pools with fresh snapshots. The prompt now warns against interpreting an empty curated list as no pools on a chain.
- Regression tests cover failed staking reads, valid staked/unstaked planning, tick alignment, cross-chain rejection, legacy compatibility, non-JSON gateway errors, source/partial-value preservation, timeout/unavailable responses and research-tool visibility.

## What remains unverified

The reported user incident cannot be reproduced or attributed conclusively: no wallet, position ID, time or error text was available. The rebalance defects above are independently established failure paths, not a proven diagnosis of that incident.

No configured local model-provider credential was available, so real-model responses were not evaluated. The tests exercise tool wiring, schemas, execution boundaries and deterministic proposal/planning logic; they do not prove every natural-language question will be answered correctly. No signed wallet flow or mainnet/fork transaction was run. Live API success does not certify every position, RPC, provider, bridge path or deployment configuration.

## Rollout

1. Review and release the service and wallet changes together. Deploying only the wallet will not add multichain knowledge to the old service.
2. Confirm the deployed wallet function budgets and `TOPAZ_AGENT_API_URL`/authentication configuration. Confirm effective stats configuration uses `https://api.topazdex.com/api/stats`; source defaults do not override existing environment values.
3. Check service health reports 0.20.0; verify MCP lists `topaz_get_multichain_data` and `topaz_get_guide` and metadata retains executionChainIds `[56]`.
4. Run real-model smoke questions covering each chain, spoke action refusal, xTOPAZ redemption, bridge recovery, Arc decimals and the separate AI Wallet URL. Test a known BNB account rebalance through unsigned compilation/simulation, then a separately authorized signed flow if needed.
5. After deployment, verify ERC-8004 metadata and preview its update. The repository explicitly requires separate authorization for the irreversible on-chain metadata update; none was performed here.


## Release completion — 2026-09-20

- Service commit: `b71eedd16eccea64451e258eb710decf698cab75`, pushed to origin/main and deployed to `topaz-agent`. Production `/health`, `/version`, `/agent.json` and MCP report agent 0.20.0, tools 3.6.0, five research chains, execution chain `[56]` and 45 tools.
- Wallet commit: `706ad358b91c92b3200555a802744c445e14efb2`, pushed to origin/main; Vercel production deployment `5SHseeQPC1xSrnNUUD5Bur5ZQF8u` succeeded. `ai.topazdex.com` serves the app, and `/api/agent` rejects a Base context with HTTP 400.
- Verified the RPC chain as 56 and the registry owner as the configured signer before estimating gas and previewing metadata. Agent #113284 update transaction: [0x3973af1e3e09e01c6ccf50514d0363506dc1f13924375d2f91c5023896107f75](https://bscscan.com/tx/0x3973af1e3e09e01c6ccf50514d0363506dc1f13924375d2f91c5023896107f75), confirmed in block 123000398.
- Deployed `verify-metadata.js`: 17 passed, zero warnings, zero errors; metadata matches code exactly.
- Production real-model smoke now passed: it called getMultichainData and getTopazGuide, correctly enumerated the five chains, limited AI rebalance execution to BNB, explained Arc units and identified the separate AI Wallet URL. This supersedes the earlier lack of local real-model verification, but is not exhaustive model evaluation.
- GitHub Actions run 35514603006 did not start its jobs because recent account payments failed or the spending limit needs adjustment. This is an account-level CI blocker. Local validation and the independent Vercel build/deployment passed.
