import type { JSX, ReactNode } from 'react';

export function Header(): JSX.Element {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <strong style={{ color: 'var(--accent)', fontSize: 16 }}>oneGrid</strong>
      <span style={{ color: 'var(--muted)', fontSize: 12 }}>
        showcase — every package wired together
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ color: 'var(--muted)', fontSize: 11 }}>
        v1.1.0 (formula 457/480 · OOXML round-trip · CRDT collab)
      </span>
    </header>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function Mono({ children }: { children: ReactNode }): JSX.Element {
  return (
    <code
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        padding: '1px 4px',
        borderRadius: 3,
        fontSize: 11,
      }}
    >
      {children}
    </code>
  );
}

export function Output({ children }: { children: ReactNode }): JSX.Element {
  return (
    <pre
      style={{
        background: '#070a0d',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: 8,
        margin: 0,
        fontSize: 11,
        color: 'var(--text)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {children}
    </pre>
  );
}

export function Btn({ onClick, children }: { onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--panel)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        padding: '4px 10px',
        borderRadius: 4,
        fontSize: 12,
        cursor: 'pointer',
        marginRight: 4,
      }}
    >
      {children}
    </button>
  );
}

export function GridHost({ children }: { children?: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        height: 360,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}
