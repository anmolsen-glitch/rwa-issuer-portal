import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // strictPort: fail loudly if 5173 is taken rather than silently sliding to 5174,
  // where this dev server would shadow the investor portal on `localhost`.
  server: { port: 5173, strictPort: true },
});
