/**
 * Bun bundler plugin: make MathJax's built-in default font the classic TeX
 * font.
 *
 * `@mathjax/src`'s SVG output statically imports its default font through the
 * package-internal alias `#default-font/*` (New Computer Modern, ~1 MB
 * minified). We always pass the TeX font explicitly (see src/render/tex.ts),
 * so redirecting the alias keeps the unused font out of the bundle.
 */
import type { BunPlugin } from "bun";

const plugin: BunPlugin = {
  name: "mathjax-tex-font",
  setup(build) {
    build.onResolve({ filter: /^#default-font\// }, args => ({
      path: Bun.resolveSync(args.path.replace("#default-font/", "@mathjax/mathjax-tex-font/mjs/"), args.importer),
    }));
  },
};

export default plugin;
