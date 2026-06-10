import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root to this package (works for both the local monorepo
  // and a standalone Vercel build of packages/web).
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // wagmi/walletconnect pull in optional native deps; mark them external for RSC.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};
export default nextConfig;
