# cat-builder

A lightweight, browser-only editor for category-theory / commutative diagrams, in the spirit of
[quiver](https://github.com/varkor/quiver). Place objects on a grid, draw arrows between objects
_or between arrows_, label everything in TeX, and export the result as an image: **SVG, PNG or
WebP**.

Labels are typeset with MathJax into SVG _paths_ (classic Computer Modern TeX fonts), so exported
SVGs are fully self-contained: no web fonts, no `<foreignObject>`, no external references. They
render the same in browsers, Inkscape/Illustrator/Figma, and when rasterised.

## Features

- Objects sit in the squares of an unbounded grid; labels in TeX (`\mathcal{C}`, `\mathbb{N}`, `\mathsf{Set}`, …)
- Arrows between objects, between arrows (2-cells), and loops
- Tails: none, mono `↣`, hook `↪`, maps-to `↦`
- Bodies: solid, dashed, dotted, squiggly, none (phantom)
- Heads: arrow, epi `↠`, none; single / double `⇒` / triple `⇛` lines
- Curve (bend) and offset (parallel arrows); loop direction and size. Sides are read on screen:
  "left" is the left of a vertical arrow and above a horizontal one, and positive curve or offset
  goes right (or down), whichever way the arrow points
- Label left / right / centre (arrow broken around it) / over, positioned anywhere along the arrow
- Adjunction `⊣`, pullback `⌟` and pushout `⌜` marks
- Undo/redo, box selection, multi-edit of arrow options
- Autosave to browser storage; share links (Export → Link: the diagram is compressed into the
  URL hash)
- A floating tool bar (top right; bottom centre on screens ≤700px wide): layout (grid spacing,
  zoom, label font size, arrow stroke width, show grid, fit and center), colours, export, undo,
  redo, clear (undoable, with a short notice) and info. The grid is an editing aid only and is
  never exported
- Label font size and arrow stroke width belong to the diagram, like its colours: saved, undoable,
  shared and exported as shown. Arrowheads, double-line spacing, dashes and the like scale with
  the stroke so heavier arrows keep their proportions
- Diagram colours: a stroke colour (arrows and labels) and a background colour, each with an
  opacity. The canvas is drawn in them live, a checkerboard shows through wherever the
  background is transparent, and they're saved with the diagram (autosave, undo, share links).
- Export to SVG, PNG, WebP (1–4×) with a preview. Exports use the diagram's colours exactly, so
  they look like the canvas (a background at 0% exports as transparent). Safari can't encode
  WebP; it shows a message suggesting PNG instead.

Diagram data is **not** embedded in exported images; use share links to reopen a diagram.

## Usage

| Gesture                                    | Action                                                         |
| ------------------------------------------ | -------------------------------------------------------------- |
| Click an empty square, then click it again | New object (a double-click works too, as in quiver)            |
| Drag from an object or arrow               | New arrow (release on an empty square to create the target)    |
| Drag from an object back onto itself       | Loop                                                           |
| ⌥/Alt-drag                                 | Move objects                                                   |
| Drag empty space                           | Box select (⇧ adds)                                            |
| Click / ⇧-click                            | Select / toggle (anywhere in an object's square selects it)    |
| Double-click a cell / Enter                | Edit its label                                                 |
| Esc / ⌘↩ (in the label)                    | Finish editing (Enter adds a line; newlines are just spacing)  |
| Tab (in the label)                         | Indent with four spaces (⇧Tab leaves the field)                |
| Arrow keys                                 | Nudge selected objects                                         |
| ⌫ / Delete                                 | Delete selection (and everything attached to it)               |
| ⌘Z / ⌘⇧Z                                   | Undo / redo                                                    |
| Scroll, space-drag, middle-drag            | Pan                                                            |
| Pinch, ⌘/Ctrl-scroll                       | Zoom                                                           |

## Development

```bash
bun install
bun dev          # dev server with HMR (src/index.ts)
bun test         # unit tests
bun run typecheck
bun run build    # static site in dist/ (host anywhere)
```

The app is entirely client-side; the Bun server only serves the bundle during development.

## Architecture

```
src/
  model/      Pure data: types, diagram operations, undo history, codec (autosave + links)
  geometry/   Vectors, cubic Béziers (clipping, offsets, arc length), style constants, layout
  render/     MathJax typesetting, layout → SVG markup, image export
  editor/     React UI: canvas interaction, inspector, toolbar, hit-testing, persistence
  App.tsx     Wiring: autosave, share links, keyboard shortcuts, export, toasts
plugins/      Bun bundler plugin that keeps MathJax's unused default font out of the bundle
scripts/      Production build (Bun.build with the plugin)
```

The data flow goes one way: `Diagram` → `layoutDiagram` → `Layout` (clipped curves, strokes,
label boxes) → SVG markup. The editor and every exporter render from the same layout, so the
export matches what's on screen. Hit-testing is geometric, against the layout, and doesn't rely
on DOM events.

A diagram is an ordered list of cells (vertices and edges). Edges always come after their
endpoints, so layout can go in a single pass and deletion cascades in a single pass. Operations
are pure functions that return new diagrams. Expected failures (occupied cells, malformed links,
unsupported formats, TeX errors) come back as values with enumerated error kinds rather than
being thrown.

### Notes

- **Arrow sides.** Label side, curve and offset don't use tikz-cd's "left of the direction of
  travel". An arrow is treated as if it pointed up (if mostly vertical or exactly diagonal) or
  right (if mostly horizontal), so reversing an arrow never moves its label or bend. The
  inspector's label-side icons show where the label will go on the selected arrow. Loops
  are the exception: "left" is outside the loop. See `frameSign` in `src/geometry/layout.ts`.
- **Colours.** Part of the diagram, not of the export settings. Each is a hex colour plus a
  separate opacity, written as `fill-opacity` (background) and group `opacity` (strokes and
  labels) rather than 8-digit hex or `rgba()`, which many SVG tools outside browsers don't
  support. Group opacity also keeps overlapping strokes from looking darker where they cross.
  The canvas renders them the same way. Only the editor's overlays (selection, hover) use the
  UI theme.
- **Bundle size.** MathJax plus the TeX font is the bulk of the bundle: about 2 MB minified,
  ~750 KB gzipped. Glyph paths are what make the exported SVGs portable, and that's the cost.
- **TeX packages.** `base`, `ams`, `color`, `boldsymbol`. `\newcommand` is deliberately off,
  because definitions would leak between labels.
- **Share links.** `#d=` + base64url(deflate-raw(JSON)). The format is versioned
  (`FORMAT_VERSION` in `src/model/codec.ts`). Colours are an optional trailing field, left out
  when they're the defaults, so links made before colours existed still open.
