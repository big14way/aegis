/** The vault methods/events the dashboard reads/writes. */
export const aegisVaultAbi = [
  {
    type: "function",
    name: "arm",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sourceAsset", type: "address" },
      { name: "targetAsset", type: "address" },
      { name: "adapter", type: "address" },
      { name: "maxExitAmount", type: "uint256" },
      { name: "t2WindowSecs", type: "uint64" },
    ],
    outputs: [],
  },
  { type: "function", name: "disarm", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "confirmExit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "minOut", type: "uint256" },
    ],
    outputs: [],
  },
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
      { name: "minOut", type: "uint256" },
    ],
    outputs: [{ name: "tier", type: "uint8" }],
  },
  {
    type: "function",
    name: "isWindowOpen",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "guardOf",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "armed", type: "bool" },
          { name: "sourceAsset", type: "address" },
          { name: "targetAsset", type: "address" },
          { name: "adapter", type: "address" },
          { name: "maxExitAmount", type: "uint256" },
          { name: "t2WindowSecs", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "KEEPER_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "Evaluated",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "scoreBps", type: "uint256", indexed: false },
      { name: "tier", type: "uint8", indexed: false },
      { name: "exitFlag", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ConfirmationRequested",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "scoreBps", type: "uint256", indexed: false },
      { name: "windowExpiry", type: "uint256", indexed: false },
    ],
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
    name: "thresholds",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "t3Bps", type: "uint256" },
      { name: "t2Bps", type: "uint256" },
    ],
  },
] as const;

/** ERC-20 reads/writes the dashboard needs (balance + allowance for arming). */
export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
