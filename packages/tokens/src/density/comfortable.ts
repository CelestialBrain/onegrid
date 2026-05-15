// =============================================================================
// @onegrid/tokens/density/comfortable
//
// Default density. 32px row height — strikes the balance between
// information density and pointer/touch ergonomics.
// =============================================================================

import type { DtcgBundle } from '../index.js';

export const comfortableDtcg: DtcgBundle = {
  size: {
    $type: 'dimension',
    'row-height': { $value: '32px' },
    'header-height': { $value: '40px' },
    'detail-row-height': { $value: '160px' },
    'font-base': { $value: '13px' },
    'font-header': { $value: '13px' },
    'padding-cell-x': { $value: '10px' },
    'padding-cell-y': { $value: '6px' },
    'border-thickness': { $value: '1px' },
    chevron: { $value: '14px' },
    checkbox: { $value: '16px' },
    'resize-handle': { $value: '6px' },
    'line-height': { $value: '1.4' },
    'touch-hit-zone': { $value: '40px' },
    scrollbar: { $value: '12px' },
    icon: { $value: '16px' },
  },
};

export default comfortableDtcg;
