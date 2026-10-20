import type { Element, Root } from 'hast';
import type { CitationSource, CitationTextContent, TextCitation, TextPart } from './types';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readSource(value: unknown): CitationSource {
  if (!object(value) || typeof value.id !== 'string' || !value.id ||
    typeof value.url !== 'string' || typeof value.hostname !== 'string') {
    throw new Error('Invalid citation source.');
  }
  const url = new URL(value.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    url.hostname !== value.hostname) {
    throw new Error('Unsafe citation source.');
  }
  const title = value.title;
  const published = value.published_at;
  if (title != null && typeof title !== 'string') throw new Error('Invalid source title.');
  if (published != null && (typeof published !== 'string' || !Number.isFinite(Date.parse(published)))) {
    throw new Error('Invalid source date.');
  }
  return { id: value.id, url: url.href, hostname: value.hostname, title, published_at: published };
}

function readReference(value: unknown, sources: CitationSource[], length: number): TextCitation {
  if (!object(value) || typeof value.source_id !== 'string' ||
    typeof value.start_index !== 'number' || typeof value.end_index !== 'number') {
    throw new Error('Invalid citation range.');
  }
  const { source_id, start_index, end_index } = value;
  if (!Number.isInteger(start_index) || !Number.isInteger(end_index) || start_index < 0 ||
    end_index < start_index || end_index > length || !sources.some(source => source.id === source_id)) {
    throw new Error('Invalid citation range or unknown source.');
  }
  return { source_id, start_index, end_index };
}

/** Reject malformed protocol data rather than inventing or silently dropping references. */
export function readCitationContent(value: Record<string, unknown>): CitationTextContent {
  if (typeof value.text !== 'string') throw new Error('Invalid citation text payload.');
  const rawSources = value.sources ?? [];
  const rawReferences = value.citations ?? [];
  if (!Array.isArray(rawSources) || !Array.isArray(rawReferences)) throw new Error('Invalid citation lists.');
  const sources = rawSources.map(readSource);
  if (new Set(sources.map(source => source.id)).size !== sources.length) {
    throw new Error('Conflicting citation source identities.');
  }
  const length = Array.from(value.text).length;
  const citations = rawReferences.map(reference => readReference(reference, sources, length));
  const part_id = value.part_id;
  if (part_id != null && (typeof part_id !== 'string' || !part_id)) {
    throw new Error('Invalid text snapshot identity.');
  }
  return {
    text: value.text, ...(part_id != null ? { part_id } : {}),
    ...(sources.length ? { sources } : {}), ...(citations.length ? { citations } : {})
  };
}

function markerIds(node: Element): string[] {
  const ids = node.properties.dataSourceIds;
  return Array.isArray(ids) && ids.every((value): value is string => typeof value === 'string') ? ids : [];
}

/** Insert verified reference nodes only AFTER HTML sanitization, never inside code. */
export function citationPlugin(part: TextPart) {
  return function plugin() {
    return function transform(tree: Root) {
      const offsets = [0];
      for (const point of part.text) offsets.push(offsets[offsets.length - 1] + point.length);
      const references = (part.citations ?? []).map(citation => ({
        ...citation,
        start: offsets[citation.start_index], end: offsets[citation.end_index]
      }));
      const consumed = new Set<number>();
      const marker = (ids: string[]): Element => ({ type: 'element', tagName: 'cite', properties: { dataSourceIds: [...new Set(ids)] }, children: [] });
      const isMarker = (node: Root['children'][number]): node is Element => node.type === 'element' && node.tagName === 'cite' && Array.isArray(node.properties.dataSourceIds);
      function walk(parent: Root | Element) {
        for (let index = 0;index < parent.children.length;index++) {
          const node = parent.children[index];
          const start = node.position?.start.offset;
          const end = node.position?.end.offset;
          if (node.type === 'element' && ['pre', 'code'].includes(node.tagName)) {
            references.forEach((reference, key) => { if (start !== undefined && end !== undefined && reference.end >= start && reference.end <= end) consumed.add(key); });
            continue;
          }
          if (node.type === 'element' && node.tagName === 'a' && typeof node.properties.href === 'string') {
            const matched = (part.sources ?? []).find(source => source.url === node.properties.href);
            const supported = references.map((reference, key) => ({ reference, key })).filter(({ reference, key }) => !consumed.has(key) && matched?.id === reference.source_id && start !== undefined && end !== undefined && reference.start < end && reference.end > start);
            if (supported.length) { parent.children.splice(index, 1, marker(supported.map(item => item.reference.source_id))); supported.forEach(item => consumed.add(item.key)); continue; }
          }
          if (node.type === 'element') walk(node);
          if (start === undefined || end === undefined) continue;
          const pending = references.map((reference, key) => ({ reference, key })).filter(({ reference, key }) => !consumed.has(key) && reference.end >= start && reference.end <= end);
          if (!pending.length) continue;
          if (node.type === 'text' && part.text.slice(start, end) === node.value) {
            const replacements: (typeof node | Element)[] = [];
            let cursor = 0;
            for (const offset of [...new Set(pending.map(item => item.reference.end))].sort((a, b) => a - b)) {
              replacements.push({ type: 'text', value: node.value.slice(cursor, offset - start) });
              replacements.push(marker(pending.filter(item => item.reference.end === offset).map(item => item.reference.source_id)));
              cursor = offset - start;
            }
            replacements.push({ type: 'text', value: node.value.slice(cursor) });
            parent.children.splice(index, 1, ...replacements); index += replacements.length - 1;
          } else { parent.children.splice(index + 1, 0, marker(pending.map(item => item.reference.source_id))); index++; }
          pending.forEach(item => consumed.add(item.key));
        }
        for (let index = 0;index < parent.children.length - 1;index++) {
          const first = parent.children[index];
          if (!isMarker(first)) continue;
          let next = index + 1;
          while (next < parent.children.length) {
            const between = parent.children[next];
            if (between.type !== 'text' || between.value.trim()) break;
            next++;
          }
          const last = parent.children[next];
          if (last && isMarker(last)) {
            first.properties.dataSourceIds = [...new Set([...markerIds(first), ...markerIds(last)])];
            parent.children.splice(index + 1, next - index); index--;
          }
        }
      }
      walk(tree);
    };
  };
}
