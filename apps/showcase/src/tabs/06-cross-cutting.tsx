// =============================================================================
// Cross-cutting — tokens, intl, touch, a11y, plugin-kit, undo, temporal,
// sparklines, headless.
// =============================================================================

import { useMemo, useRef, useState, type JSX } from 'react';
import * as tokens from '@onegrid/tokens';
import * as intl from '@onegrid/intl';
import * as touch from '@onegrid/touch';
import * as a11y from '@onegrid/a11y';
import * as pluginKit from '@onegrid/plugin-kit';
import * as undoPkg from '@onegrid/undo';
import * as temporal from '@onegrid/temporal';
import { drawSparkline, type SparklineKind } from '@onegrid/sparklines';
import { Card, Mono, Output } from '../ui';

export function CrossCuttingTab(): JSX.Element {
  return (
    <div>
      <IntlSection />
      <SparklineSection />
      <TokensSection />
      <UndoSection />
      <TemporalSection />
      <SurfacesSection />
    </div>
  );
}

function IntlSection(): JSX.Element {
  const [locale, setLocale] = useState('en-US');
  const value = 1234567.89;
  const date = useMemo(() => new Date(2024, 5, 15), []);

  return (
    <Card title="@onegrid/intl — number / date formatting per locale">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--muted)' }}>locale:</label>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
          style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
        >
          {['en-US', 'en-GB', 'de-DE', 'fr-FR', 'ja-JP', 'zh-CN', 'ar-SA', 'th-TH'].map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>
      <Output>
{`isValidLocale:    ${intl.isValidLocale(locale)}
formatNumber:     ${intl.formatNumber(value, locale)}
formatNumber (€): ${intl.formatNumber(value, locale, { style: 'currency', currency: 'EUR' })}
formatDate:       ${intl.formatDate(date, locale)}
formatDate full:  ${intl.formatDate(date, locale, { dateStyle: 'full' })}`}
      </Output>
    </Card>
  );
}

function SparklineSection(): JSX.Element {
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const data = useMemo(() => Array.from({ length: 30 }, (_, i) => Math.sin(i * 0.4) * 50 + Math.random() * 30), []);
  const winloss = useMemo(() => Array.from({ length: 30 }, () => (Math.random() > 0.5 ? 1 : -1)), []);

  return (
    <Card title="@onegrid/sparklines — line / bar / win-loss">
      {(['line', 'bar', 'winloss'] as SparklineKind[]).map((kind) => (
        <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <Mono>{kind}</Mono>
          <canvas
            ref={(el) => {
              if (el) {
                canvasRefs.current[kind] = el;
                const ctx = el.getContext('2d');
                if (ctx) {
                  el.width = 300;
                  el.height = 32;
                  ctx.clearRect(0, 0, 300, 32);
                  const series = kind === 'winloss' ? winloss : data;
                  // CanvasRenderingContext2D's fillStyle is a wider union
                  // than the sparklines MinimalCtx structural shape; cast
                  // at the boundary.
                  drawSparkline(
                    ctx as unknown as Parameters<typeof drawSparkline>[0],
                    { x: 0, y: 0, width: 300, height: 32 },
                    series,
                    kind,
                    kind === 'winloss' ? {} : { color: '#2f81f7' },
                  );
                }
              }
            }}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3 }}
          />
        </div>
      ))}
    </Card>
  );
}

function TokensSection(): JSX.Element {
  const tokenNames = Object.keys(tokens).sort();
  return (
    <Card title="@onegrid/tokens — DTCG 2025.10 token bundle exports">
      <Output>{tokenNames.join(', ')}</Output>
    </Card>
  );
}

function UndoSection(): JSX.Element {
  const [log, setLog] = useState<string[]>([]);
  const manager = useMemo(() => {
    if (typeof (undoPkg as { createUndoManager?: unknown }).createUndoManager === 'function') {
      const { createUndoManager } = undoPkg as unknown as {
        createUndoManager: (opts: { apply: (e: unknown) => void; revert: (e: unknown) => void; capacity?: number }) => unknown;
      };
      return createUndoManager({
        apply: (e: unknown) => setLog((l) => [...l, `apply: ${JSON.stringify(e)}`]),
        revert: (e: unknown) => setLog((l) => [...l, `revert: ${JSON.stringify(e)}`]),
        capacity: 100,
      });
    }
    return null;
  }, []);
  void manager;

  return (
    <Card title="@onegrid/undo — transactional edit history">
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
        Public exports: <Mono>{Object.keys(undoPkg).sort().join(', ')}</Mono>
      </div>
      <Output>{log.length === 0 ? '(no events yet)' : log.join('\n')}</Output>
    </Card>
  );
}

function TemporalSection(): JSX.Element {
  return (
    <Card title="@onegrid/temporal — time-travel log">
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
        Exports: <Mono>{Object.keys(temporal).sort().join(', ')}</Mono>
      </div>
    </Card>
  );
}

function SurfacesSection(): JSX.Element {
  return (
    <Card title="Other cross-cutting surfaces">
      <Output>
{`@onegrid/touch:       ${Object.keys(touch).sort().join(', ')}
@onegrid/a11y:        ${Object.keys(a11y).sort().join(', ')}
@onegrid/plugin-kit:  ${Object.keys(pluginKit).sort().join(', ')}`}
      </Output>
    </Card>
  );
}
