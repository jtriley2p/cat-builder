import { expect, test } from "bun:test";
import { parsePaint } from "../model/paint";
import { DEFAULT_EXPORT_SETTINGS, parseExportSettings } from "./exportSettings";

test("paints are validated and normalised", () => {
  expect(parsePaint({ color: "#AABBCC", alpha: 0.5 })).toEqual({ color: "#aabbcc", alpha: 0.5 });
  expect(parsePaint({ color: "#abc", alpha: 1 })).toBeNull();
  expect(parsePaint({ color: "red", alpha: 1 })).toBeNull();
  expect(parsePaint({ color: "#000000", alpha: "1" })).toBeNull();
  expect(parsePaint({ color: "#000000", alpha: 7 })).toEqual({ color: "#000000", alpha: 1 });
});

test("saved export settings keep valid fields and default the rest", () => {
  expect(parseExportSettings(null)).toEqual(DEFAULT_EXPORT_SETTINGS);
  expect(parseExportSettings("nope")).toEqual(DEFAULT_EXPORT_SETTINGS);
  expect(parseExportSettings({ format: "png", scale: 7 })).toEqual({ format: "png", scale: DEFAULT_EXPORT_SETTINGS.scale });
  expect(parseExportSettings({ format: "gif", scale: 3 })).toEqual({ format: DEFAULT_EXPORT_SETTINGS.format, scale: 3 });
  expect(parseExportSettings({ format: "link", scale: 2 }).format).toBe("link");
});

test("colour fields saved by earlier versions are dropped", () => {
  const s = parseExportSettings({
    format: "webp",
    scale: 3,
    stroke: { color: "#123456", alpha: 0.8 },
    background: "white",
    ink: "#ff0000",
  });
  expect(s).toEqual({ format: "webp", scale: 3 });
});
