"use client";

import dynamic from 'next/dynamic';
import { StreamTypeEnum } from '@/lib/types';

// Plotly must run client-side; disable SSR
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false, loading: () => (
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
    <div className="w-full">
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
          } else {
            figure = raw;
          }
        }
        if (figure) return <PlotlyGraph figure={figure} responsive={responsive} config={configOverride} style={style} />;
      }
      // html format
      if (artifact['html'] && typeof artifact['html'] === 'string') {
        return (
          <div className="overflow-hidden rounded border border-blue-200">
            <div dangerouslySetInnerHTML={{ __html: artifact['html'] as string }} />
          </div>
        );
      }
      // url to hosted html
      const url = artifact['url'] as string | undefined;
      if (isHttpUrl(url)) {
        return (
          <div className="overflow-hidden rounded border border-blue-200">
            <iframe src={url} className="h-[420px] w-full" />
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

      return (
        <div className={`${responsive ? 'overflow-auto' : ''} rounded border border-gray-200`}>
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
              {rows.map((r, i) => (
                <tr key={i} className={trBase}>
                  {r.map((cell, j) => (
                    <td key={j} className={`px-2 py-1 align-top ${bordered ? 'border border-gray-200' : ''}`}>{String(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
