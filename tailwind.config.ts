import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1a1c23",
        paper: "#f7f6f2",
        card: "#ffffff",
        border: "#e6e3da",
        accent: {
          DEFAULT: "#3a6b5c",
          soft: "#e4efe9"
        },
        gold: {
          DEFAULT: "#c8963e",
          soft: "#f6ecd8"
        },
        rose: {
          DEFAULT: "#b5556b",
          soft: "#f6e4e8"
        },
        muted: "#8a8778"
      },
      fontFamily: {
        display: ["Georgia", "ui-serif", "serif"],
        body: ["-apple-system", "Segoe UI", "sans-serif"]
      },
      borderRadius: {
        xl2: "1.25rem"
      },
      boxShadow: {
        card: "0 1px 2px rgba(26,28,35,0.04), 0 8px 24px rgba(26,28,35,0.06)"
      }
    }
  },
  plugins: []
};

export default config;
