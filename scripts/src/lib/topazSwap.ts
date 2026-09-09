import { AbiCoder, Interface, getAddress, solidityPacked } from "ethers";
import {
  fetchTopazQuote,
  TOPAZ_PERMIT2,
  TOPAZ_UNIVERSAL_ROUTER,
  wrappedTopazToken,
  type TopazQuote,
  type TopazQuoteRequest,
  validateTopazQuote,
} from "./topazRouting.js";

const coder = AbiCoder.defaultAbiCoder();
const router = new Interface([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);
const erc20 = new Interface([
  "function approve(address spender, uint256 amount) returns (bool)",
]);
const permit2 = new Interface([
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);
const ROUTER_BALANCE = 1n << 255n;
export interface TopazSwapCall {
  to: string;
  data: string;
  value: string;
  label: string;
}
export interface TopazSwapBatch {
  chainId: 56;
  payer: string;
  recipient: string;
  atomicRequired: boolean;
  permit2SignatureRequired: false;
  quotedAt: number;
  deadline: number;
  quote: TopazQuote;
  transactions: TopazSwapCall[];
}

/** Build commands from validated routes. Never forward arbitrary API calldata.
 * All output is swept to the caller; a single aggregate minimum covers splits. */
export function encodeTopazSwap(
  quote: TopazQuote,
  request: TopazQuoteRequest & { recipient: string },
  deadline: number,
): TopazSwapCall {
  quote = validateTopazQuote(quote, request);
  const nativeIn = request.tokenIn.toUpperCase() === "BNB";
  const nativeOut = request.tokenOut.toUpperCase() === "BNB";
  const inputs: string[] = [];
  let commands = "0x";
  function add(command: string, types: string[], values: unknown[]) {
    commands += command;
    inputs.push(coder.encode(types, values));
  }
  if (nativeIn)
    add("0b", ["address", "uint256"], [TOPAZ_UNIVERSAL_ROUTER, quote.amount]);
  for (const route of quote.routes) {
    for (const [index, hop] of route.hops.entries()) {
      const payerIsUser = index === 0 && !nativeIn;
      const amount = index === 0 ? BigInt(route.amountIn) : ROUTER_BALANCE;
      if (hop.protocol === "cl") {
        add(
          "00",
          ["address", "uint256", "uint256", "bytes", "bool"],
          [
            TOPAZ_UNIVERSAL_ROUTER,
            amount,
            0n,
            solidityPacked(
              ["address", "int24", "address"],
              [
                getAddress(hop.tokenIn),
                hop.tickSpacing,
                getAddress(hop.tokenOut),
              ],
            ),
            payerIsUser,
          ],
        );
      } else {
        add(
          "08",
          [
            "address",
            "uint256",
            "uint256",
            "tuple(address from,address to,bool stable)[]",
            "bool",
          ],
          [
            TOPAZ_UNIVERSAL_ROUTER,
            amount,
            0n,
            [
              {
                from: getAddress(hop.tokenIn),
                to: getAddress(hop.tokenOut),
                stable: hop.protocol === "v2-stable",
              },
            ],
            payerIsUser,
          ],
        );
      }
    }
  }
  if (nativeOut)
    add(
      "0c",
      ["address", "uint256"],
      [request.recipient, quote.minimumAmountOut],
    );
  else
    add(
      "04",
      ["address", "address", "uint256"],
      [getAddress(request.tokenOut), request.recipient, quote.minimumAmountOut],
    );
  return {
    to: TOPAZ_UNIVERSAL_ROUTER,
    data: router.encodeFunctionData("execute", [commands, inputs, deadline]),
    value: nativeIn ? quote.amount : "0",
    label: "Swap via Topaz API routing",
  };
}

/** Returns the complete ordered call list; never signs or broadcasts. All calls
 * must be sent by `payer`. ERC20 routes require an atomic wallet/account batch. */
export async function buildTopazSwapBatch(
  request: TopazQuoteRequest & {
    payer: string;
    recipient?: string;
    chainId?: number;
  },
): Promise<TopazSwapBatch> {
  if (request.chainId !== undefined && request.chainId !== 56)
    throw new Error("Only chainId 56 is supported");
  const payer = getAddress(request.payer);
  const recipient = getAddress(request.recipient ?? payer);
  if (/^0x0{40}$/i.test(payer) || recipient !== payer)
    throw new Error(
      "Topaz batch recipient must be the executing payer account",
    );
  const quotedAt = Math.floor(Date.now() / 1000);
  const deadline = quotedAt + (request.deadlineSeconds ?? 600);
  const quote = await fetchTopazQuote({ ...request, recipient });
  if (deadline <= Math.floor(Date.now() / 1000))
    throw new Error("Topaz quote expired during build");
  const transactions: TopazSwapCall[] = [];
  const nativeIn = request.tokenIn.toUpperCase() === "BNB";
  const tokenIn = getAddress(wrappedTopazToken(request.tokenIn));
  if (!nativeIn) {
    // Always reset: independent of current allowances, including earlier batch calls.
    for (const amount of [0n, request.amountIn])
      transactions.push({
        to: tokenIn,
        data: erc20.encodeFunctionData("approve", [TOPAZ_PERMIT2, amount]),
        value: "0",
        label:
          amount === 0n
            ? "Reset token allowance to Permit2"
            : "Approve input amount to Permit2",
      });
    transactions.push({
      to: TOPAZ_PERMIT2,
      data: permit2.encodeFunctionData("approve", [
        tokenIn,
        TOPAZ_UNIVERSAL_ROUTER,
        request.amountIn,
        deadline,
      ]),
      value: "0",
      label: "Approve Topaz router through Permit2",
    });
  }
  transactions.push(
    encodeTopazSwap(quote, { ...request, recipient }, deadline),
  );
  if (!nativeIn) {
    transactions.push({
      to: TOPAZ_PERMIT2,
      data: permit2.encodeFunctionData("approve", [
        tokenIn,
        TOPAZ_UNIVERSAL_ROUTER,
        0n,
        deadline,
      ]),
      value: "0",
      label: "Clear Topaz Permit2 allowance",
    });
    transactions.push({
      to: tokenIn,
      data: erc20.encodeFunctionData("approve", [TOPAZ_PERMIT2, 0n]),
      value: "0",
      label: "Clear token allowance to Permit2",
    });
  }
  return {
    chainId: 56,
    payer,
    recipient,
    atomicRequired: !nativeIn,
    permit2SignatureRequired: false,
    quotedAt,
    deadline,
    quote,
    transactions,
  };
}
