import type { CSSProperties, ReactNode } from 'react';
import { useOneGrid, type UseOneGridOptions } from './use-one-grid';

export interface OneGridProps extends UseOneGridOptions {
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Children render inside the grid host before mount; useful for SSR placeholders. */
  readonly children?: ReactNode;
}

/**
 * Render-and-forget convenience component. For grids you need to interact
 * with imperatively (scroll, get metrics), use `useOneGrid` directly.
 */
export function OneGrid(props: OneGridProps): ReactNode {
  const { className, style, children, ...gridOptions } = props;
  const { ref } = useOneGrid(gridOptions);
  return (
    <div
      ref={ref}
      className={className}
      style={{ position: 'relative', height: '100%', ...style }}
    >
      {children}
    </div>
  );
}
