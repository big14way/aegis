/**
 * Minimal ABIs (the subset the agent actually calls), written as const tuples so
 * viem can fully infer argument and return types. The engine ABI matches the
 * camelCase selectors the Stylus SDK exports from the Rust source.
 */

export const riskEngineAbi = [
  {
    type: "function",
    name: "score",
    stateMutability: "view",
    inputs: [
      { name: "sources", type: "uint8[]" },
      { name: "classes", type: "uint8[]" },
      { name: "severitiesBps", type: "uint256[]" },
      { name: "confidencesBps", type: "uint256[]" },
      { name: "agesSecs", type: "uint256[]" },
    ],
    outputs: [
      { name: "scoreBps", type: "uint256" },
      { name: "tier", type: "uint8" },
      { name: "exitFlag", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "deviationBps",
    stateMutability: "view",
    inputs: [
      { name: "observed", type: "uint256" },
      { name: "expected", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "thresholds",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "t3Bps", type: "uint256" },
      { name: "t2Bps", type: "uint256" },
    ],
  },
] as const;

export const aegisVaultAbi = [
  {
    type: "function",
    name: "evaluateAndExit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "sources", type: "uint8[]" },
      { name: "classes", type: "uint8[]" },
      { name: "severitiesBps", type: "uint256[]" },
      { name: "confidencesBps", type: "uint256[]" },
      { name: "agesSecs", type: "uint256[]" },
    ],
    outputs: [{ name: "tier", type: "uint8" }],
  },
  {
    type: "function",
    name: "confirmExit",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "checkOracle",
    stateMutability: "view",
    inputs: [
      { name: "feed", type: "address" },
      { name: "expectedPrice", type: "uint256" },
    ],
    outputs: [{ name: "deviationBps", type: "uint256" }],
  },
  {
    type: "function",
    name: "isWindowOpen",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "Exited",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "adapter", type: "address", indexed: true },
      { name: "sourceAsset", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "targetAsset", type: "address", indexed: false },
      { name: "proceeds", type: "uint256", indexed: false },
      { name: "scoreBps", type: "uint256", indexed: false },
      { name: "agentId", type: "uint256", indexed: false },
    ],
  },
] as const;

export const identityRegistryAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "setAgentWallet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "wallet", type: "address" },
    ],
    outputs: [],
  },
] as const;

export const reputationRegistryAbi = [
  {
    type: "function",
    name: "giveFeedback",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "score", type: "uint8" },
      { name: "tag", type: "bytes32" },
      { name: "uri", type: "string" },
    ],
    outputs: [],
  },
] as const;
