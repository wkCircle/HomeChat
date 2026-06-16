"use client";

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { StreamTypeEnum } from '@/lib/types';

// Plotly must run client-side; disable SSR
// Explicit generic loosens prop typing so TS doesn't complain about Plot props
const Plot = dynamic<any>(() => import('react-plotly.js'), { ssr: false, loading: () => (
  <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">Loading chart…</div>
)});

function isHttpUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function PlotlyGraph({ figure, style, responsive, config }: { figure: any; style?: Record<string, any>; responsive?: boolean; config?: any }) {
  const data = figure?.data ?? [];
  const layout = figure?.layout ?? { autosize: true, margin: { t: 30, r: 10, b: 40, l: 40 } };
  const finalConfig = config ?? figure?.config ?? { displayModeBar: true, responsive: true };
  return (
    // Allow horizontal scroll if layout is wider than viewport
    <div className="w-full max-w-full overflow-x-auto">
      {/* @ts-ignore - react-plotly.js types */}
      <Plot
        data={data}
        layout={layout}
        config={finalConfig}
        style={{ width: '100%', height: '100%', ...(style || {}) }}
        useResizeHandler={responsive ?? true}
      />
    </div>
  );
}

export default function ArtifactRenderer({
  artifact,
  kind,
}: {
  artifact: Record<string, unknown>;
  kind: typeof StreamTypeEnum.UI | typeof StreamTypeEnum.INTERACTIVE;
}) {
  const type = (artifact?.['type'] as string) || '';

  // Graphs (Plotly)
  if (type === 'graph') {
    const renderer = (artifact['renderer'] as string) || '';
    if (renderer === 'plotly') {
      const format = (artifact['format'] as string) || 'json';
      if (format === 'json') {
        // Support multiple shapes:
        // 1) data is a JSON string of {data, layout, config}
        // 2) data is an object {data, layout, config}
        // 3) data is an object { props: { figure: string|object, responsive?: bool, config?: object, style?: object } }
        const raw = artifact['data'];
        let figure: any = undefined;
        let responsive: boolean | undefined;
        let configOverride: any | undefined;
        let style: Record<string, any> | undefined;

        if (typeof raw === 'string') {
          try { figure = JSON.parse(raw); } catch { /* ignore */ }
        } else if (raw && typeof raw === 'object') {
          const maybeProps = (raw as Record<string, any>).props;
          if (maybeProps && typeof maybeProps === 'object') {
            const f = (maybeProps as any).figure;
            if (typeof f === 'string') {
              try { figure = JSON.parse(f); } catch { /* ignore */ }
            } else if (f && typeof f === 'object') {
              figure = f;
            }
            responsive = (maybeProps as any).responsive ?? true;
            configOverride = (maybeProps as any).config;
            style = (maybeProps as any).style;
            figure = raw;
          }
        }
        if (figure) return <PlotlyGraph figure={figure} responsive={responsive} config={configOverride} style={style} />;
      }
      // html format
      if (artifact['html'] && typeof artifact['html'] === 'string') {
        return (
          <div className="overflow-auto rounded border border-blue-200" style={{ touchAction: 'pan-x pan-y' }}>
            <div dangerouslySetInnerHTML={{ __html: artifact['html'] as string }} />
          </div>
        );
      }
      // url to hosted html
      const url = artifact['url'] as string | undefined;
      if (isHttpUrl(url)) {
        return (
          <div className="overflow-hidden rounded border border-blue-200">
            <iframe src={url} className="h-[420px] w-full max-w-full" />
          </div>
        );
      }
      // Otherwise fallback to JSON
    }
  }

  // Simple tables
  if (type === 'table') {
    // Some tools wrap the actual payload under 'data'
    const payload = ((artifact['data'] as Record<string, unknown>) ?? artifact) as Record<string, unknown>;
    const title = (payload['title'] as string) || '';
    const props = (payload['props'] as Record<string, unknown>) || {};
    const rawColumns = (payload['columns'] as any[]) ?? [];
    const rawRows = (payload['rows'] as any[]) ?? [];

    if (rawColumns.length && rawRows.length) {
      type Col = string | { key?: string; label?: string };
      const columnKeys: string[] = rawColumns.map((c: Col, i: number) => {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object') return c.key ?? c.label ?? String(i);
        return String(i);
      });
      const columnLabels: string[] = rawColumns.map((c: Col, i: number) => {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object') return c.label ?? c.key ?? String(i);
        return String(i);
      });

      // Normalize rows to array-of-arrays in column order
      const rows: any[][] = Array.isArray(rawRows[0])
        ? (rawRows as any[][])
        : (rawRows as Record<string, any>[]).map((r) => columnKeys.map((k) => r?.[k]));

      const striped = Boolean(props['striped']);
      const hover = Boolean(props['hover']);
      const bordered = Boolean(props['bordered']);
      const responsive = props['responsive'] !== false; // default true
      const size = (props['size'] as string) || 'sm';

      const textSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-sm' : 'text-xs';
      const tableBorder = bordered ? 'border border-gray-200' : '';
      const trBase = `${striped ? 'odd:bg-white even:bg-gray-50' : ''} ${hover ? 'hover:bg-gray-100' : ''}`.trim();

      // CSV helpers
      const escapeCsv = (val: any) => {
        const s = val == null ? '' : String(val);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const csvHeader = columnLabels.map(escapeCsv).join(',');
      const csvBody = rows.map((r) => r.map(escapeCsv).join(',')).join('\r\n');
      const csv = csvHeader + (rows.length ? '\r\n' + csvBody : '');
      const filename = ((title || 'table').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'table') + '.csv';

      const [copied, setCopied] = useState(false);
      const doCopy = async () => {
        try {
          await navigator.clipboard.writeText(csv);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // fallback
          const ta = document.createElement('textarea');
          ta.value = csv;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      };
      const doDownload = () => {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };

      // Local fullscreen + pagination state
      const [open, setOpen] = useState(false);
      const [pageSize, setPageSize] = useState<number>(10);
      const [page, setPage] = useState<number>(1);

      const totalRows = rows.length;
      const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
      const currentPage = Math.min(page, totalPages);
      const startIdx = (currentPage - 1) * pageSize;
      const endIdx = Math.min(startIdx + pageSize, totalRows);

      // Table component for reuse (inline and fullscreen)
      const TableContent = ({ inFullscreen = false }: { inFullscreen?: boolean }) => {
        const visibleRows = rows.slice(startIdx, endIdx);
        return (
          <div className={`${responsive ? 'overflow-auto' : ''} rounded border border-gray-200`} style={{ touchAction: 'pan-x pan-y' }}>
            {/* Toolbar that shares scroll width with the table */}
            <div className="min-w-full flex items-center justify-between gap-2 border-b bg-gray-50 px-2 py-1">
              {/* Left: actions */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={doCopy}
                  title={copied ? 'Copied!' : 'Copy as CSV'}
                  aria-label="Copy as CSV"
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100"
                >
                  {/* Copy icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6A2.25 2.25 0 0 1 10.5 3.75h7.5A2.25 2.25 0 0 1 20.25 6v9A2.25 2.25 0 0 1 18 17.25h-1.5M8.25 7.5H6A2.25 2.25 0 0 0 3.75 9.75v7.5A2.25 2.25 0 0 0 6 19.5h7.5A2.25 2.25 0 0 0 15.75 17.25v-1.5" />
                  </svg>
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  onClick={doDownload}
                  title="Download CSV"
                  aria-label="Download CSV"
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100"
                >
                  {/* Download icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 10.5 12 15m0 0 4.5-4.5M12 15V3" />
                  </svg>
                  <span>Download</span>
                </button>
                {!inFullscreen && (
                  <button
                    type="button"
                    onClick={() => setOpen(true)}
                    title="Fullscreen"
                    aria-label="Open fullscreen table"
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100"
                  >
                    {/* Expand icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9V5.25A1.5 1.5 0 0 1 5.25 3.75H9M15 3.75h3.75a1.5 1.5 0 0 1 1.5 1.5V9M20.25 15v3.75a1.5 1.5 0 0 1-1.5 1.5H15M9 20.25H5.25a1.5 1.5 0 0 1-1.5-1.5V15" />
                    </svg>
                    <span>Fullscreen</span>
                  </button>
                )}
              </div>
              {/* Right: showing, page size, pagination */}
              <div className="flex items-center gap-2 text-[11px] text-gray-600">
                <span className="hidden sm:inline">Showing {totalRows ? startIdx + 1 : 0}–{endIdx} of {totalRows} rows</span>
                <label className="flex items-center gap-1">
                  <span className="hidden sm:inline">Rows per page</span>
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="rounded border border-gray-300 bg-white px-1 py-0.5 text-[11px] shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="inline-flex items-center rounded px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    Prev
                  </button>
                  <span className="tabular-nums">{currentPage}/{totalPages}</span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="inline-flex items-center rounded px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                    aria-label="Next page"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
            <table className={`min-w-full text-left ${textSize} ${tableBorder}`}>
              {title ? (
                <caption className="caption-top border-b bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 text-left">
                  {title}
                </caption>
              ) : null}
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {columnLabels.map((label, i) => (
                    <th key={i} className={`px-2 py-1 font-medium ${bordered ? 'border border-gray-200' : ''}`}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`text-gray-700 ${bordered ? 'border-t border-gray-200' : ''}`}>
                {visibleRows.map((r, i) => (
                  <tr key={i} className={trBase}>
                    {r.map((cell, j) => (
                      <td key={j} className={`px-2 py-1 align-top break-words ${bordered ? 'border border-gray-200' : ''}`}>{String(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      };

      // Modal wrapper
      const FullscreenModal = () => {
        useEffect(() => {
          if (!open) return;
          const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
          window.addEventListener('keydown', onKey);
          return () => window.removeEventListener('keydown', onKey);
        }, [open]);
        if (!open) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4" onClick={() => setOpen(false)} aria-modal="true" role="dialog">
            <div className="relative w-[min(95vw,1100px)] max-w-[95vw] rounded-xl bg-white p-2 shadow-2xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
              <div className="max-h-[85vh] overflow-auto">
                <TableContent inFullscreen />
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute -right-2 -top-2 rounded-full bg-white p-1 text-gray-700 shadow dark:bg-gray-800 dark:text-gray-200"
              >
                ✕
              </button>
            </div>
          </div>
        );
      };

      return (
        <>
          <TableContent inFullscreen={false} />
          <FullscreenModal />
        </>
      );
    }
  }

  // Default: show expandable JSON for unknown artifact shapes
  return (
    <details className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs" open>
      <summary className="cursor-pointer font-medium text-blue-700 select-none">
        {kind === StreamTypeEnum.INTERACTIVE ? '🖱 Interactive block' : '📊 UI block'}
      </summary>
      <pre className="mt-1 max-h-60 overflow-auto text-blue-900">{JSON.stringify(artifact, null, 2)}</pre>
    </details>
  );
}
