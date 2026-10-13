/**
 * The toolbar's Export button and its popover: format, scale, and a preview
 * of exactly the SVG that will be exported, drawn over a checkerboard so
 * transparency is visible. Colours come from the diagram (the Colours menu),
 * so the export looks like the canvas.
 */
import { useMemo } from "react";
import { canEncodeWebp, exportSvg, RASTER_SCALES, type ExportFormat } from "../render/export";
import { Row, Segmented, type Choice } from "./controls";
import type { ExportSettings } from "./exportSettings";
import { usePopover } from "./usePopover";
import type { Editor } from "./useEditor";

interface ExportMenuProps {
  readonly editor: Editor;
  readonly settings: ExportSettings;
  readonly setSettings: (s: ExportSettings) => void;
  readonly onExport: () => void;
}

const FORMAT_CHOICES: Choice<ExportFormat>[] = [
  { value: "svg", label: "SVG", title: "Vector image" },
  { value: "png", label: "PNG", title: "Raster image" },
  { value: "webp", label: "WebP", title: "Raster image (not supported by Safari)" },
];

const SCALE_CHOICES: Choice<number>[] = RASTER_SCALES.map(s => ({ value: s, label: `${s}×`, title: `${s}× pixel density` }));

export const ExportMenu = (props: ExportMenuProps) => {
  const popover = usePopover();
  return (
    <div className="popover-anchor" ref={popover.ref}>
      <button type="button" className="primary" onClick={popover.toggle} aria-expanded={popover.open}>
        Export
      </button>
      {popover.open && <ExportPanel {...props} />}
    </div>
  );
};

const ExportPanel = ({ editor, settings, setSettings, onExport }: ExportMenuProps) => {
  const set = (patch: Partial<ExportSettings>) => setSettings({ ...settings, ...patch });
  const { layout, style } = editor;
  const { colors } = editor.diagram;
  const svg = useMemo(() => exportSvg(layout, style, colors), [layout, style, colors]);
  const raster = settings.format !== "svg";
  const webpBlocked = settings.format === "webp" && !canEncodeWebp();

  return (
    <div className="popover panel export-panel" role="dialog" aria-label="Export">
      <div className="preview checkerboard">
        {svg ? (
          <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.markup)}`} alt="Export preview" />
        ) : (
          <span className="muted">Nothing to export yet</span>
        )}
      </div>
      <Row label="Format">
        <Segmented choices={FORMAT_CHOICES} value={settings.format} onChange={format => set({ format })} />
      </Row>
      {raster && (
        <Row label="Scale">
          <Segmented choices={SCALE_CHOICES} value={settings.scale} onChange={scale => set({ scale })} />
        </Row>
      )}
      {webpBlocked && <p className="warning">This browser can't encode WebP (Safari doesn't support it). Choose PNG instead.</p>}
      <div className="actions">
        {svg && (
          <span className="muted size">
            {raster ? `${Math.round(svg.width * settings.scale)} × ${Math.round(svg.height * settings.scale)} px` : `${svg.width} × ${svg.height}`}
          </span>
        )}
        <button type="button" className="primary" onClick={onExport} disabled={!svg}>
          Download {settings.format.toUpperCase()}
        </button>
      </div>
    </div>
  );
};
