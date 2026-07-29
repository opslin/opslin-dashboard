import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ReadyLaunch Dark Theme
        landing: {
          bg: "#0A0A0A",
          "bg-alt": "#111111",
          card: "#141414",
          "card-hover": "#1A1A1A",
          border: "#1F1F1F",
          "border-hover": "#2A2A2A",
          divider: "#1F1F1F",
        },
        // Evergreen brand green — matches --opslin-accent-* dark-mode values
        // in src/styles/tokens.css, expressed statically here since the
        // landing page's own dark theme is a static Tailwind palette, not
        // the app shell's CSS-custom-property tokens.
        accent: {
          DEFAULT: "#22c55e",
          hover: "#3ed070",
          muted: "#16a34a",
          glow: "rgba(34, 197, 94, 0.15)",
          soft: "rgba(34, 197, 94, 0.1)",
          badge: "#052e16",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        hero: [
          "4.5rem",
          { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        "hero-mobile": [
          "2.75rem",
          { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        section: [
          "3rem",
          { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        "section-mobile": [
          "2rem",
          { lineHeight: "1.15", letterSpacing: "-0.01em", fontWeight: "700" },
        ],
        stat: ["3.5rem", { lineHeight: "1", fontWeight: "700" }],
      },
      borderRadius: {
        "2xl": "16px",
        "3xl": "24px",
      },
      boxShadow: {
        "glow-sm": "0 0 15px rgba(34, 197, 94, 0.2)",
        glow: "0 0 25px rgba(34, 197, 94, 0.3)",
        "glow-lg": "0 0 40px rgba(34, 197, 94, 0.4)",
        card: "0 1px 3px rgba(0, 0, 0, 0.3)",
      },
      animation: {
        "fade-in-up": "fadeInUp 0.6s ease-out forwards",
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "count-up": "countUp 2s ease-out forwards",
        "slide-in-right": "slideInRight 0.4s ease-out forwards",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        countUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(34, 197, 94, 0.2)" },
          "50%": { boxShadow: "0 0 30px rgba(34, 197, 94, 0.4)" },
        },
      },
      spacing: {
        section: "6rem",
        "section-lg": "8rem",
      },
      maxWidth: {
        landing: "80rem",
      },
    },
  },
  plugins: [animate],
};

export default config;
