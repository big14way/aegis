import type { Config } from "tailwindcss";

/**
 * Aegis design system — "tactical defense console".
 * Obsidian base, bone text, a single molten-amber command accent that escalates
 * to hot red at FIRED. Deliberately monochrome-plus-one-warning, not a rainbow.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: {
          DEFAULT: "#0a0b0d",
          800: "#101216",
          700: "#16191f",
          600: "#1d212a",
          500: "#262b36",
        },
        bone: {
          DEFAULT: "#ece7dd",
          dim: "#9a958c",
          faint: "#5c5950",
        },
        // Command accent (armed / active).
        amber: {
          DEFAULT: "#f5a623",
          bright: "#ffc14d",
          deep: "#b9791a",
        },
        // Escalation (fired / critical).
        alert: {
          DEFAULT: "#ff3b30",
          deep: "#b3261e",
        },
        // Safe / nominal (used sparingly).
        steel: "#5e8f96",
      },
      fontFamily: {
        display: ["var(--font-chakra)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.04em",
        widest2: "0.28em",
      },
      boxShadow: {
        "armed": "0 0 0 1px rgba(245,166,35,0.5), 0 0 30px -6px rgba(245,166,35,0.55)",
        "fired": "0 0 0 1px rgba(255,59,48,0.6), 0 0 44px -4px rgba(255,59,48,0.6)",
        "panel": "inset 0 1px 0 0 rgba(236,231,221,0.04), 0 18px 40px -24px rgba(0,0,0,0.9)",
      },
      keyframes: {
        sweep: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgba(245,166,35,0.45)" },
          "70%": { boxShadow: "0 0 0 14px rgba(245,166,35,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(245,166,35,0)" },
        },
        firePulse: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        ticker: {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(-50%)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        sweep: "sweep 2.4s linear infinite",
        pulseRing: "pulseRing 2s ease-out infinite",
        firePulse: "firePulse 1s ease-in-out infinite",
        rise: "rise 0.5s cubic-bezier(0.2,0.7,0.2,1) both",
      },
    },
  },
  plugins: [],
};
export default config;
