import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root to the repo so Next doesn't pick a parent lockfile.
  outputFileTracingRoot: resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  // wagmi/walletconnect pull in optional native deps; mark them external for RSC.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};
export default nextConfig;
