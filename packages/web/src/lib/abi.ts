/** The vault methods the dashboard reads/writes (arm/disarm + status). */
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
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
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
] as const;
