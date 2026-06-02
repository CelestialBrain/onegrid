import { useState, type JSX } from 'react';
import { TABS } from './tabs';
import { Header } from './ui';

export function App(): JSX.Element {
  const [activeId, setActiveId] = useState<string>(TABS[0]!.id);
  const active = TABS.find((t) => t.id === activeId) ?? TABS[0]!;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr',
        height: '100vh',
        background: 'var(--bg)',
      }}
    >
      <Header />
      <nav
        style={{
          display: 'flex',
          gap: 4,
          padding: '8px 16px',
          background: 'var(--panel)',
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto',
        }}
      >
        {TABS.map((t) => {
          const isActive = t.id === activeId;
          return (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              style={{
                background: isActive ? 'var(--accent)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text)',
                border: '1px solid ' + (isActive ? 'var(--accent)' : 'var(--border)'),
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
      <main
        style={{
          padding: 16,
          overflow: 'auto',
          color: 'var(--text)',
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{active.label}</h2>
          <p style={{ margin: '4px 0', color: 'var(--muted)', fontSize: 12 }}>
            {active.description}
          </p>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Exercises:{' '}
            {active.packages.map((p, i) => (
              <span key={p}>
                <code
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    padding: '1px 6px',
                    borderRadius: 3,
                    marginRight: 4,
                  }}
                >
                  {p}
                </code>
                {i < active.packages.length - 1 ? ' ' : ''}
              </span>
            ))}
          </div>
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, padding: 16 }}>
          <active.Component />
        </div>
      </main>
    </div>
  );
}
