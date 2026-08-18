import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem" },
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
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "pulse-soft": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.55" } },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out",
        "pulse-soft": "pulse-soft 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
