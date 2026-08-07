import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Same token names as before so every component keeps working -
        // only the values changed, to a light "sakura/blush" palette
        // (soft-sand bg, pink-sorbet accent, charcoal text) instead of
        // the old dark ember-glow theme.
        dusk: "#F8EDEB",        // was near-black; now the main page bg (soft-sand)
        "dusk-deep": "#FFFFFF", // was darkest bg; now card/modal/overlay surface (white)
        birch: "#2D2D2D",       // was near-white text; now primary text (charcoal)
        "birch-dim": "#4A4A4A", // secondary text
        ember: "#F4978E",       // primary accent (pink-sorbet)
        "ember-dim": "#DAADAF", // accent hover/darker state (dusty-rose)
        spark: "#D96C86",       // secondary highlight/link-hover text - deep
                                 // enough rose to stay readable on white/sand
        slate: "#8E8E8E",       // muted text (text-muted)
        ash: "#E7D9D4",         // borders / dividers / placeholder surfaces
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