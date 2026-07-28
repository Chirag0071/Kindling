import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        dusk: "#211E33",
        "dusk-deep": "#17151F",
        birch: "#F3E9D8",
        "birch-dim": "#D8CFC0",
        ember: "#E17A47",
        "ember-dim": "#B85F35",
        spark: "#F4C463",
        slate: "#9089A6",
        ash: "#3A3651",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        card: "22px",
      },
      keyframes: {
        drift: {
          "0%": { transform: "translateY(0) scale(1)", opacity: "0" },
          "10%": { opacity: "0.7" },
          "90%": { opacity: "0.4" },
          "100%": { transform: "translateY(-140px) scale(0.6)", opacity: "0" },
        },
      },
      animation: {
        drift: "drift 7s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
