import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArtifactRenderer from './ArtifactRenderer';

vi.mock('next/dynamic', () => ({
  default: () => function PlotMock({ data }: { data: unknown[] }) {
    return <div data-testid="plotly-chart" data-series={data.length} />;
  },
}));

describe('ArtifactRenderer', () => {
  it('renders a restored Plotly chart payload', () => {
    render(
      <ArtifactRenderer
        kind="ui"
        artifact={{
          type: 'graph',
          renderer: 'plotly',
          format: 'json',
          data: {
            props: {
              figure: {
                data: [{ type: 'bar', x: ['A'], y: [3] }],
                layout: { title: 'Stored chart' },
              },
            },
          },
        }}
      />,
    );

    expect(screen.getByTestId('plotly-chart')).toHaveAttribute('data-series', '1');
  });

  it('renders a restored table payload', () => {
    render(
      <ArtifactRenderer
        kind="ui"
        artifact={{
          type: 'table',
          data: {
            title: 'Stored table',
            columns: ['name', 'value'],
            rows: [{ name: 'A', value: 3 }],
          },
        }}
      />,
    );

    expect(screen.getByText('Stored table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'name' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '3' })).toBeInTheDocument();
  });
});