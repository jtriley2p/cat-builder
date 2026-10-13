/**
 * Production build: bundles src/index.html into a static site in dist/.
 * (The `bun build` CLI can't load bundler plugins, hence this script.)
 */
import mathjaxTexFont from "../plugins/mathjax-tex-font";

const result = await Bun.build({
  entrypoints: ["./src/index.html"],
  outdir: "./dist",
  target: "browser",
  minify: true,
  sourcemap: "linked",
  plugins: [mathjaxTexFont],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
for (const out of result.outputs) {
  console.log(`${out.path.replace(process.cwd() + "/", "")}  ${(out.size / 1024).toFixed(0)} KB`);
}
