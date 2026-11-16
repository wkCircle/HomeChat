import type { JsonValue, TabularDataset } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 32) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1));
  return isRecord(value) && Object.values(value).every((item) => isJsonValue(item, depth + 1));
}

export function parseDataset(value: unknown): TabularDataset {
  if (!isRecord(value) || value.type !== 'tabular_data' || value.schema_version !== 1 ||
      value.format !== 'json' || value.orientation !== 'columns' || !Array.isArray(value.columns) ||
      !isRecord(value.data)) throw new Error('Unsupported or invalid dataset version/format.');
  const columns = value.columns;
  const rawData = value.data;
  if (columns.length > 128 || !columns.every((key): key is string =>
    typeof key === 'string' && key.length > 0 && Array.from(key).length <= 256) ||
      new Set(columns).size !== columns.length || Object.keys(rawData).length !== columns.length) {
    throw new Error('Dataset columns must be unique and match data keys.');
  }
  const data: Record<string, JsonValue[]> = Object.create(null);
  let rowCount: number | undefined;
  for (const column of columns) {
    const values = rawData[column];
    if (!Object.hasOwn(rawData, column) || !Array.isArray(values) || !values.every((cell) => isJsonValue(cell, 2))) {
      throw new Error('Dataset contains invalid column values.');
    }
    rowCount ??= values.length;
    if (values.length !== rowCount) throw new Error('Dataset columns must have equal lengths.');
    data[column] = values;
  }
  if ((rowCount ?? 0) > 10_000 || (rowCount ?? 0) * columns.length > 200_000 ||
      new TextEncoder().encode(JSON.stringify(rawData)).length > 2_000_000) {
    throw new Error('Dataset exceeds display limits.');
  }
  return { type: 'tabular_data', schema_version: 1, format: 'json', orientation: 'columns', columns, data };
}

export interface TableView {
  title: string;
  columns: string[];
  labels: string[];
  rowCount: number;
  props: Record<string, unknown>;
  cell(row: number, column: number): unknown;
}

/** A view over canonical columns or legacy rows; never transpose a whole dataset. */
export function parseTableArtifact(artifact: Record<string, unknown>): TableView {
  const payload = isRecord(artifact.data) ? artifact.data : artifact;
  const title = typeof payload.title === 'string' ? payload.title : '';
  const props = isRecord(payload.props) ? payload.props : {};
  if (artifact.schema_version !== undefined) {
    if (artifact.schema_version !== 2) throw new Error('Unsupported table schema version.');
    const dataset = parseDataset(payload.dataset);
    const labels = payload.labels ?? dataset.columns;
    if (!Array.isArray(labels) || labels.length !== dataset.columns.length ||
        !labels.every((label): label is string => typeof label === 'string')) {
      throw new Error('Table display labels must match dataset columns.');
    }
    return { title, props, columns: dataset.columns, labels,
      rowCount: dataset.columns.length ? dataset.data[dataset.columns[0]].length : 0,
      cell: (row, column) => dataset.data[dataset.columns[column]][row] };
  }
  const rawColumns = payload.columns;
  const rows = payload.rows;
  if (!Array.isArray(rawColumns) || !Array.isArray(rows)) throw new Error('Invalid legacy table payload.');
  const columns = rawColumns.map((column) => {
    if (typeof column === 'string') return { key: column, label: column };
    if (isRecord(column)) {
      const key = column.key ?? column.label;
      const label = column.label ?? column.key;
      if (typeof key === 'string' && typeof label === 'string') return { key, label };
    }
    throw new Error('Invalid table column.');
  });
  const matrix = rows.length > 0 && Array.isArray(rows[0]);
  if (!rows.every((row) => matrix ? Array.isArray(row) && row.length === columns.length : isRecord(row))) {
    throw new Error('Inconsistent legacy table rows.');
  }
  return { title, props, columns: columns.map((column) => column.key),
    labels: columns.map((column) => column.label), rowCount: rows.length,
    cell: (row, column) => matrix ? rows[row][column] : rows[row][columns[column].key] };
}

export function tableCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Materialize CSV only on an explicit export action, never during rendering. */
export function tableToCsv(table: TableView): string {
  const escape = (value: unknown) => {
    const text = tableCellText(value);
    return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  const lines = [table.labels.map(escape).join(',')];
  for (let row = 0; row < table.rowCount; row++) {
    lines.push(table.columns.map((_, column) => escape(table.cell(row, column))).join(','));
  }
  return lines.join('\r\n');
}
