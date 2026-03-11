export type PagePresetId = "letter" | "a5" | "a4" | "a3";

export interface PagePreset {
  id: PagePresetId;
  label: string;
  width: number;
  height: number;
}

const MM_PER_INCH = 25.4;

export const PAGE_PRESETS: Record<PagePresetId, PagePreset> = {
  letter: {
    id: "letter",
    label: "Letter (8.5x11 in)",
    width: 8.5 * MM_PER_INCH,
    height: 11 * MM_PER_INCH,
  },
  a5: { id: "a5", label: "A5", width: 148, height: 210 },
  a4: { id: "a4", label: "A4", width: 210, height: 297 },
  a3: { id: "a3", label: "A3", width: 297, height: 420 },
};

export interface PageConfig {
  presetId: PagePresetId;
  orientation: "portrait" | "landscape";
  customWidth?: number;
  customHeight?: number;
}

export function resolvePageSize(config: PageConfig): {
  width: number;
  height: number;
} {
  const preset = PAGE_PRESETS[config.presetId] ?? PAGE_PRESETS.letter;
  const baseWidth = config.customWidth ?? preset.width;
  const baseHeight = config.customHeight ?? preset.height;

  if (config.orientation === "landscape") {
    return { width: baseHeight, height: baseWidth };
  }

  return { width: baseWidth, height: baseHeight };
}
