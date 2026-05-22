// Printer-compatibility matching for the SliceModal's process / filament
// dropdowns (#1325).
//
// Compatibility is read from ground truth, never guessed from preset names:
//
//   - imported (local-tier) presets carry the slicer's own
//     `compatible_printers` list — an exact list of printer-preset names.
//   - every other preset is matched through the user's uploaded Slicer
//     Bundles (.bbscfg). A bundle is scoped to one printer and lists the
//     process / filament presets shipped with it, so "process P works with
//     printer X" holds exactly when some uploaded bundle for printer X
//     contains P. No model codes, no name parsing — a newly released Bambu
//     model is covered the moment its bundle is uploaded.
//
// The result drives grouping, not hard hiding: a preset no bundle covers
// stays in the main list, and only a preset that resolves to a *different*
// printer is pushed into an "Other printers" group.

export type PrinterCompatibility = 'match' | 'mismatch' | 'unknown';

// Minimal shape of a Slicer Bundle needed for matching (see SlicerBundle in
// api/client.ts). `printer_preset_name` scopes the bundle to one printer;
// `process` / `filament` are the preset names that bundle ships.
export interface CompatibilityBundle {
  printer_preset_name: string;
  process: string[];
  filament: string[];
}

// A preset-name → set-of-compatible-printer-names index, one map per slot,
// built from every uploaded bundle. Empty when no bundles are imported.
export interface PrinterCompatibilityIndex {
  process: Map<string, Set<string>>;
  filament: Map<string, Set<string>>;
}

/** An empty index — used when no bundles are imported / available yet. */
export const EMPTY_COMPATIBILITY_INDEX: PrinterCompatibilityIndex = {
  process: new Map(),
  filament: new Map(),
};

// Bundle preset names occasionally carry BambuStudio's "# " user-clone
// prefix; strip it so a bundle entry and a tier-listed preset compare equal.
function normalizePresetName(name: string): string {
  return name.replace(/^#\s*/, '').trim();
}

/**
 * Build the compatibility index from the user's uploaded Slicer Bundles.
 * Each bundle contributes its printer to every process / filament name it
 * ships; a name shipped by several bundles accumulates every printer.
 */
export function buildCompatibilityIndex(
  bundles: readonly CompatibilityBundle[],
): PrinterCompatibilityIndex {
  const process = new Map<string, Set<string>>();
  const filament = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, name: string, printer: string) => {
    const key = normalizePresetName(name);
    if (!key) return;
    const set = map.get(key) ?? new Set<string>();
    set.add(printer);
    map.set(key, set);
  };
  for (const bundle of bundles) {
    const printer = bundle.printer_preset_name?.trim();
    if (!printer) continue;
    for (const name of bundle.process) add(process, name, printer);
    for (const name of bundle.filament) add(filament, name, printer);
  }
  return { process, filament };
}

/**
 * Classify a process / filament preset against the selected printer.
 *
 * - 'match'    — the preset is compatible with the selected printer.
 * - 'mismatch' — the preset resolves to a *different* printer.
 * - 'unknown'  — compatibility can't be determined (no `compatible_printers`
 *                and no uploaded bundle covers the preset, or no printer is
 *                selected); the caller must not hide it.
 */
export function presetCompatibility(
  preset: { name: string; compatible_printers?: string[] | null },
  slot: 'process' | 'filament',
  selectedPrinterName: string | null,
  index: PrinterCompatibilityIndex,
): PrinterCompatibility {
  // Imported presets carry the slicer's own compatible_printers list.
  const compat = preset.compatible_printers;
  if (compat && compat.length > 0) {
    if (!selectedPrinterName) return 'unknown';
    return compat.includes(selectedPrinterName) ? 'match' : 'mismatch';
  }
  // Otherwise consult the uploaded bundles.
  const printers = index[slot].get(normalizePresetName(preset.name));
  if (!printers || printers.size === 0 || !selectedPrinterName) return 'unknown';
  return printers.has(selectedPrinterName) ? 'match' : 'mismatch';
}
