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

function PlotlyGraph({ figure }: { figure: any }) {
  const data = figure?.data ?? [];
  const layout = figure?.layout ?? { autosize: true, margin: { t: 30, r: 10, b: 40, l: 40 } };
  const config = figure?.config ?? { displayModeBar: true, responsive: true };
  return (
    <div className="w-full">
      {/* @ts-ignore - react-plotly.js types */}
      <Plot data={data} layout={layout} config={config} style={{ width: '100%', height: '100%' }} useResizeHandler />
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
        // data can be a JSON string or an already-parsed object with {data, layout, config}
        const raw = artifact['data'];
        let figure: any = undefined;
        if (typeof raw === 'string') {
          try { figure = JSON.parse(raw); } catch { /* fall through */ }
        } else if (raw && typeof raw === 'object') {
          figure = raw;
        }
        if (figure) return <PlotlyGraph figure={figure} />;
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
    const columns = (artifact['columns'] as string[]) ?? [];
    const rows = (artifact['rows'] as unknown[][]) ?? [];
    if (columns.length && rows.length) {
      return (
        <div className="overflow-auto rounded border border-gray-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>{columns.map((c, i) => (<th key={i} className="px-2 py-1 font-medium">{c}</th>))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={i} className="odd:bg-white even:bg-gray-50">
                  {r.map((cell, j) => (
                    <td key={j} className="px-2 py-1 text-gray-700">{String(cell)}</td>
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
