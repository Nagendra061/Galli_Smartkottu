import React from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => React.ReactNode;
}

export function ResponsiveTable<T>({
  rows,
  columns,
  getKey,
  onRowClick,
  renderMobileCard,
}: {
  rows: T[];
  columns: TableColumn<T>[];
  getKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  renderMobileCard: (row: T) => React.ReactNode;
}) {
  return (
    <>
      {/* Phone Cards (< md) */}
      <div className="md:hidden space-y-2.5">
        {rows.map((row) => (
          <div
            key={getKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`rounded-xl border border-border-default bg-surface-card p-3.5 ${
              onRowClick ? 'cursor-pointer active:bg-surface-subtle' : ''
            }`}
          >
            {renderMobileCard(row)}
          </div>
        ))}
      </div>

      {/* Desktop / Tablet Table (>= md) */}
      <div className="hidden md:block rounded-xl border border-border-default bg-surface-card overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="border-b border-border-default bg-surface-subtle/60">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-2.5 text-xs font-semibold text-ink-secondary whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {rows.map((row) => (
              <tr
                key={getKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'hover:bg-surface-subtle/60 cursor-pointer transition-colors' : ''}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 align-middle ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
