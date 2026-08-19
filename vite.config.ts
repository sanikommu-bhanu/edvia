import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Hand-split the heavy third-party libraries so they cache
        // independently of application code, and so a student checking their
        // timetable never downloads the charting or Live-audio libraries.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
          charts: ["recharts"],
          genai: ["@google/genai"],
          motion: ["framer-motion"],
        },
      },
    },
    // The React + Firebase vendor chunks legitimately sit above Vite's
    // default 500 kB advisory; anything beyond this is worth investigating.
    chunkSizeWarningLimit: 700,
  },
  server: { port: 5173 },
});
