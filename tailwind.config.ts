import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#F5F6FB",
        ink: {
          50: "#F6F7FB",
          100: "#E9EBF3",
          200: "#D4D8E7",
          300: "#AEB5CB",
          400: "#828BA8",
          500: "#626B89",
          600: "#4C5470",
          700: "#3A405A",
          800: "#272C43",
          900: "#171B30",
          950: "#0C0F20",
        },
        brand: {
          50: "#EEF0FF",
          100: "#E2E5FF",
          200: "#C9CDFF",
          300: "#A8A9FF",
          400: "#8D84FC",
          500: "#7561F4",
          600: "#6344E4",
          700: "#5133C4",
          800: "#412C9E",
          900: "#372A7C",
        },
        mint: {
          50: "#EDFCF4",
          100: "#D4F8E3",
          200: "#ACEFCC",
          300: "#75E0AF",
          400: "#3CC98D",
          500: "#19AD73",
          600: "#0C8A5C",
          700: "#0B6E4C",
        },
        line: "#E5E8F1",
      },
      fontFamily: {
        sans: [
          "Aptos",
          "Inter",
          "Segoe UI",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        display: [
          "Aptos Display",
          "Aptos",
          "Segoe UI",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: ["Cascadia Code", "SFMono-Regular", "Consolas", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 20, 40, 0.04), 0 8px 24px -18px rgba(16, 20, 40, 0.18)",
        lift: "0 2px 4px rgba(16, 20, 40, 0.04), 0 18px 38px -22px rgba(16, 20, 40, 0.28)",
        sidebar: "18px 0 46px -30px rgba(10, 12, 30, 0.6)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.35rem",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "soft-pulse": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        "scan-line": {
          "0%": { transform: "translateY(-8px)", opacity: "0" },
          "20%": { opacity: "1" },
          "80%": { opacity: "1" },
          "100%": { transform: "translateY(220px)", opacity: "0" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out both",
        "slide-up": "slide-up 260ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "scale-in": "scale-in 180ms ease-out both",
        shimmer: "shimmer 1.6s infinite",
        "soft-pulse": "soft-pulse 2s ease-in-out infinite",
        "scan-line": "scan-line 2.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
