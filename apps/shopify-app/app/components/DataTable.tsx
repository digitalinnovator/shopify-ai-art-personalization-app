import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /** Hide the column on narrow screens instead of scrolling it. */
  hideBelow?: 'md' | 'sm';
  actions?: boolean;
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Rendered instead of the table when there are no rows. */
  emptyState: ReactNode;
  caption?: string;
}

function cellClass<T>(c: Column<T>): string | undefined {
  const classes = [
    c.align === 'right' ? 'num' : '',
    c.actions ? 'actions' : '',
    c.hideBelow === 'md' ? 'hide-md' : '',
    c.hideBelow === 'sm' ? 'hide-sm' : '',
  ].filter(Boolean);
  return classes.length ? classes.join(' ') : undefined;
}

export function DataTable<T>({ columns, rows, rowKey, emptyState, caption }: DataTableProps<T>) {
  if (rows.length === 0) return <>{emptyState}</>;
  return (
    <div className="table-wrap">
      <table className="table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cellClass(c)}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={cellClass(c)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
