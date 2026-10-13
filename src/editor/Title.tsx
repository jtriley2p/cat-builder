/**
 * The app title, "Cat / Builder", set in Computer Modern italic by the same
 * MathJax typesetter as the diagram labels: on-theme for a LaTeX-flavoured
 * tool, identical on every platform, and no extra font to load.
 */
import { useMemo } from "react";
import { typeset } from "../render/tex";

const LINES = ["Cat", "Builder"];

/** Font size of the title, in px. */
const EM = 18;

export const Title = () => {
  const boxes = useMemo(() => LINES.map(line => typeset(`\\textit{${line}}`, "normal")), []);
  return (
    <h1 className="title" aria-label={LINES.join(" ")}>
      {boxes.map((box, i) =>
        box ? (
          <svg
            key={LINES[i]}
            viewBox={box.viewBox}
            width={box.width * EM}
            height={(box.ascent + box.descent) * EM}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: box.body }}
          />
        ) : null,
      )}
    </h1>
  );
};
