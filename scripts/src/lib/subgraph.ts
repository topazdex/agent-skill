import { GraphQLClient } from "graphql-request";

const V2_URL =
  process.env.SUBGRAPH_V2_URL ??
  "https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v2/v0.0.4/gn";

const V3_URL =
  process.env.SUBGRAPH_V3_URL ??
  "https://api.goldsky.com/api/public/project_cmgzljqwl006c5np2gnao4li4/subgraphs/topaz-v3/v0.0.2/gn";

export const v2Client = new GraphQLClient(V2_URL);
export const v3Client = new GraphQLClient(V3_URL);

export const SUBGRAPH_URLS = { v2: V2_URL, v3: V3_URL };
