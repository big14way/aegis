import type { Metadata } from "next";
import { Chakra_Petch, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-chakra",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Aegis — Verifiable Crisis-Response Guardian",
  description:
    "A DeFi/RWA guardian whose risk-scoring and exit decisions run on-chain in Arbitrum Stylus. Bounded, non-custodial execution.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${chakra.variable} ${plexMono.variable}`}>
      <body className="relative">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
