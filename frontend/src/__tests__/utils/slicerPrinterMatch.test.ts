import { describe, it, expect } from 'vitest';
import {
  buildCompatibilityIndex,
  presetCompatibility,
  EMPTY_COMPATIBILITY_INDEX,
  type CompatibilityBundle,
} from '../../utils/slicerPrinterMatch';

const X1C = 'Bambu Lab X1 Carbon 0.4 nozzle';
const P2S = 'Bambu Lab P2S 0.4 nozzle';

// Two uploaded bundles, one per printer — the ground truth all matching
// is derived from. Note P2S: a model the old hard-coded list never knew
// about, now covered purely because its bundle was uploaded (#1325).
const BUNDLES: CompatibilityBundle[] = [
  {
    printer_preset_name: X1C,
    process: ['0.20mm Standard @BBL X1C', '0.20mm Strength @BBL X1C'],
    filament: ['Bambu PLA Basic @BBL X1C'],
  },
  {
    printer_preset_name: P2S,
    process: ['0.20mm Standard @BBL P2S', '0.16mm Standard @BBL P2S'],
    filament: ['Bambu PLA Basic @BBL P2S'],
  },
];

describe('buildCompatibilityIndex', () => {
  it('maps each preset name to the printers whose bundles ship it', () => {
    const index = buildCompatibilityIndex(BUNDLES);
    expect([...(index.process.get('0.20mm Standard @BBL X1C') ?? [])]).toEqual([X1C]);
    expect([...(index.process.get('0.16mm Standard @BBL P2S') ?? [])]).toEqual([P2S]);
    expect([...(index.filament.get('Bambu PLA Basic @BBL P2S') ?? [])]).toEqual([P2S]);
  });

  it('unions printers when several bundles ship the same preset name', () => {
    const shared = '0.20mm Standard';
    const index = buildCompatibilityIndex([
      { printer_preset_name: X1C, process: [shared], filament: [] },
      { printer_preset_name: P2S, process: [shared], filament: [] },
    ]);
    expect(index.process.get(shared)).toEqual(new Set([X1C, P2S]));
  });

  it("strips BambuStudio's '# ' user-clone prefix so names compare equal", () => {
    const index = buildCompatibilityIndex([
      { printer_preset_name: X1C, process: ['# 0.20mm Custom'], filament: [] },
    ]);
    expect(index.process.has('0.20mm Custom')).toBe(true);
  });

  it('skips bundles with no printer name', () => {
    const index = buildCompatibilityIndex([
      { printer_preset_name: '', process: ['Orphan Process'], filament: [] },
    ]);
    expect(index.process.size).toBe(0);
  });
});

describe('presetCompatibility', () => {
  const index = buildCompatibilityIndex(BUNDLES);

  it('uses compatible_printers exactly when present (imported / local tier)', () => {
    const preset = { name: 'My Process', compatible_printers: [X1C] };
    expect(presetCompatibility(preset, 'process', X1C, EMPTY_COMPATIBILITY_INDEX)).toBe('match');
    expect(presetCompatibility(preset, 'process', P2S, EMPTY_COMPATIBILITY_INDEX)).toBe('mismatch');
  });

  it('is unknown when compatible_printers is set but no printer is selected', () => {
    expect(
      presetCompatibility({ name: 'P', compatible_printers: [X1C] }, 'process', null, index),
    ).toBe('unknown');
  });

  it('matches a preset shipped by the selected printer\'s bundle', () => {
    expect(presetCompatibility({ name: '0.20mm Standard @BBL X1C' }, 'process', X1C, index)).toBe(
      'match',
    );
    expect(
      presetCompatibility({ name: 'Bambu PLA Basic @BBL P2S' }, 'filament', P2S, index),
    ).toBe('match');
  });

  it('flags a preset whose bundle is for a different printer (the #1325 bug)', () => {
    // X1C selected, but this process only ships in the P2S bundle.
    expect(presetCompatibility({ name: '0.16mm Standard @BBL P2S' }, 'process', X1C, index)).toBe(
      'mismatch',
    );
  });

  it('is unknown when no uploaded bundle covers the preset', () => {
    expect(
      presetCompatibility({ name: '0.20mm Standard @BBL A1' }, 'process', X1C, index),
    ).toBe('unknown');
  });

  it('is unknown when no bundles are imported at all', () => {
    expect(
      presetCompatibility(
        { name: '0.20mm Standard @BBL X1C' },
        'process',
        X1C,
        EMPTY_COMPATIBILITY_INDEX,
      ),
    ).toBe('unknown');
  });

  it('is unknown when no printer is selected', () => {
    expect(
      presetCompatibility({ name: '0.20mm Standard @BBL X1C' }, 'process', null, index),
    ).toBe('unknown');
  });

  it("matches across the '# ' user-clone prefix", () => {
    const index2 = buildCompatibilityIndex([
      { printer_preset_name: X1C, process: ['# 0.20mm Custom'], filament: [] },
    ]);
    expect(presetCompatibility({ name: '0.20mm Custom' }, 'process', X1C, index2)).toBe('match');
  });
});
