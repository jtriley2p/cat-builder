/**
 * Development / preview server. The app is entirely client-side; this only
 * serves the bundled page. `bun run build` produces a static `dist/` that any
 * static host can serve instead.
 *
 * Bundler plugins for this server are configured in bunfig.toml.
 */
import { serve } from "bun";
import index from "./index.html";

const server = serve({
  routes: {
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`cat-builder running at ${server.url}`);
