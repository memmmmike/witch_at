import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        witch: {
          soot: {
            950: "#0c090d",
            900: "#120f12",
            800: "#1a161a",
            700: "#231e24",
          },
          forest: {
            900: "#0e1610",
            700: "#1a2a1c",
            500: "#3d5240",
          },
          plum: {
            900: "#2a1f2e",
            700: "#3d2a42",
            500: "#5a3d5e",
            400: "#7b5278",
          },
          sage: {
            500: "#5c6b5c",
            400: "#7a8a7a",
          },
          amber: {
            500: "#b8942e",
            400: "#c9a227",
          },
          parchment: "#e0d9d0",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        dissipate: "dissipate 0.6s ease-in forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", filter: "blur(8px)" },
          "100%": { opacity: "1", filter: "blur(0)" },
        },
        dissipate: {
          "0%": { opacity: "1", filter: "blur(0)" },
          "100%": { opacity: "0", filter: "blur(12px)", transform: "translateY(-8px) scale(0.98)" },
        },
      },
      backgroundImage: {
        "mood-calm": "linear-gradient(135deg, #0e1610 0%, #1a2a1c 50%, #0e1610 100%)",
        "mood-neutral": "linear-gradient(135deg, #120f12 0%, #2a1f2e 50%, #120f12 100%)",
        "mood-intense": "linear-gradient(135deg, #1a0f08 0%, #3d2018 50%, #2a1810 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
