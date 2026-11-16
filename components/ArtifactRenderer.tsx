"use client";

import dynamic from 'next/dynamic';
import TableArtifact from './TableArtifact';

// Plotly must run client-side; disable SSR
// Explicit generic loosens prop typing so TS doesn't complain about Plot props
const Plot = dynamic<any>(() => import('react-plotly.js'), { ssr: false, loading: () => (
  <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">Loading chart…</div>
)});

function PlotlyGraph({ figure, style, responsive, config }: { figure: any; style?: Record<string, any>; responsive?: boolean; config?: any }) {
  const data = figure?.data ?? [];
  const sourceLayout = figure?.layout ?? { autosize: true, margin: { t: 30, r: 10, b: 40, l: 40 } };
  const layout = {
    ...sourceLayout,
    autosize: true,
    width: undefined,
    margin: {
      t: 30,
      r: 12,
      b: 48,
      l: 36,
      ...(sourceLayout?.margin ?? {}),
    },
  };
  const finalConfig = {
    displayModeBar: true,
    responsive: true,
    ...(figure?.config ?? {}),
    ...(config ?? {}),
  };
  const defaultHeight = (typeof layout?.height === 'number' && layout.height > 0) ? layout.height : 420;
  return (
    <div className="artifact-plot-wrapper w-full max-w-full overflow-hidden rounded border border-blue-200 bg-white">
      {/* @ts-ignore - react-plotly.js types */}
      <Plot
        data={data}
        layout={layout}
        config={finalConfig}
        style={{ width: '100%', maxWidth: '100%', height: defaultHeight, ...(style || {}) }}
        useResizeHandler={responsive ?? true}
      />
    </div>
  );
}

export default function ArtifactRenderer({
  artifact,
}: {
  artifact: Record<string, unknown>;
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
          }
        }
        if (figure) return <PlotlyGraph figure={figure} responsive={responsive} config={configOverride} style={style} />;
      }
      if (
        format !== 'json' ||
        typeof artifact['html'] === 'string' ||
        typeof artifact['url'] === 'string'
      ) {
        return (
          <p role="alert" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            HTML and hosted chart artifacts are not supported for security reasons. Generate a JSON chart instead.
          </p>
        );
      }
      // Otherwise fallback to JSON
    }
  }

  if (type === 'table') return <TableArtifact artifact={artifact} />;

  // Default: show expandable JSON for unknown artifact shapes
  return (
    <details className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs" open>
      <summary className="cursor-pointer font-medium text-blue-700 select-none">
        📊 UI block
      </summary>
      <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all text-blue-900">{JSON.stringify(artifact, null, 2)}</pre>
    </details>
  );
}
