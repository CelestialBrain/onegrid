// =============================================================================
// @onegrid/tokens/density/spacious
//
// Touch-first density. 48dp row height matches Material 48dp / Apple
// HIG 44pt minimum tap-target floors. `--og-density-touch-hit-zone`
// expands accordingly.
// =============================================================================

import type { DtcgBundle } from '../index.js';

export const spaciousDtcg: DtcgBundle = {
  size: {
    $type: 'dimension',
    'row-height': { $value: '48px' },
    'header-height': { $value: '56px' },
    'detail-row-height': { $value: '200px' },
    'font-base': { $value: '15px' },
    'font-header': { $value: '15px' },
    'padding-cell-x': { $value: '16px' },
    'padding-cell-y': { $value: '12px' },
    'border-thickness': { $value: '1px' },
    chevron: { $value: '18px' },
    checkbox: { $value: '20px' },
    'resize-handle': { $value: '12px' },
    'line-height': { $value: '1.5' },
    'touch-hit-zone': { $value: '48px' },
    scrollbar: { $value: '14px' },
    icon: { $value: '18px' },
  },
};

export default spaciousDtcg;
