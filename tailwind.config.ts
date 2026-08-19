import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem" },
    // Mobile-first breakpoints. `xs` exists because 360 px Androids are a
    // real and common floor, and a few layouts need one step below `sm`.
    screens: {
      xs: "360px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1440px",
    },
    extend: {
      colors: {
        edvia: {
          50: "#F7F5FC",
          100: "#EFEAFA",
          200: "#DED2F5",
          300: "#C4AEEC",
          400: "#A483DD",
          500: "#8257D3",
          600: "#6B3FBE",
          700: "#57329B",
          800: "#452A79",
          900: "#392460",
        },
        surface: "#FFFFFF",
        background: "#FAF9FD",
        border: "hsl(260 20% 90%)",
        muted: "#F1EEF9",
        "muted-foreground": "#71708A",
        success: "#22A06B",
        danger: "#E5484D",
        warning: "#F5A524",
        info: "#3B82F6",
      },
      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Sora", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 2px 10px 0 rgba(88, 56, 158, 0.06)",
        card: "0 4px 24px 0 rgba(88, 56, 158, 0.08)",
        floating: "0 12px 32px 0 rgba(88, 56, 158, 0.18)",
      },
      spacing: {
        "safe-top": "env(safe-area-inset-top, 0px)",
        "safe-bottom": "env(safe-area-inset-bottom, 0px)",
        nav: "var(--nav-total)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "pulse-soft": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.55" } },
        // ---- EDVIA robot ambient motion ----
        // Breathing and float are separate so they can run at different
        // periods and never sync into a single mechanical bounce.
        breathe: {
          "0%,100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.022)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        "orbit-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "orbit-reverse": {
          from: { transform: "rotate(360deg)" },
          to: { transform: "rotate(0deg)" },
        },
        "glow-pulse": {
          "0%,100%": { opacity: "0.35", transform: "scale(1)" },
          "50%": { opacity: "0.7", transform: "scale(1.06)" },
        },
        "particle-rise": {
          "0%": { opacity: "0", transform: "translateY(6px) scale(0.6)" },
          "40%": { opacity: "0.9" },
          "100%": { opacity: "0", transform: "translateY(-16px) scale(1)" },
        },
        "bounce-once": {
          "0%,100%": { transform: "translateY(0)" },
          "35%": { transform: "translateY(-9px)" },
          "65%": { transform: "translateY(-2px)" },
        },
        "shake-soft": {
          "0%,100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-3px)" },
          "75%": { transform: "translateX(3px)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s var(--ease-out-soft)",
        "pulse-soft": "pulse-soft 1.8s ease-in-out infinite",
        breathe: "breathe 4.2s ease-in-out infinite",
        float: "float 5.5s ease-in-out infinite",
        "orbit-slow": "orbit-slow 14s linear infinite",
        "orbit-reverse": "orbit-reverse 20s linear infinite",
        "glow-pulse": "glow-pulse 3.2s ease-in-out infinite",
        "particle-rise": "particle-rise 2.4s ease-out infinite",
        "bounce-once": "bounce-once 0.7s var(--ease-spring)",
        "shake-soft": "shake-soft 0.4s ease-in-out",
        "slide-up": "slide-up 0.42s var(--ease-out-soft) both",
        "scale-in": "scale-in 0.3s var(--ease-out-soft) both",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
