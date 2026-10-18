import { describe, expect, it } from 'vitest';
import { NdjsonParser } from './ndjson';
import { StreamTypeEnum } from './types';
import type { CitationTextContent, StreamEvent, TextPart } from './types';

const content: CitationTextContent = {
  text: '\u{1f600} A claim.',
  sources: [{
    id: 'source_1', url: 'https://example.com/source', title: 'Example source',
    hostname: 'example.com', published_at: null,
  }],
  citations: [{ source_id: 'source_1', start_index: 2, end_index: 10 }],
};

type TextEvent = StreamEvent & { content: CitationTextContent };

describe('citation text NDJSON contract', () => {
  it.each([1, 3, 23, 4096])('retains citation metadata across %i-byte chunks', (size) => {
    const event = { type: StreamTypeEnum.TEXT, content, metadata: {} };
    const bytes = new TextEncoder().encode(`${JSON.stringify(event)}\n${JSON.stringify(event)}\n`);
    const parser = new NdjsonParser<TextEvent>();
    const parsed: TextEvent[] = [];
    for (let index = 0; index < bytes.length; index += size) {
      parsed.push(...parser.push(bytes.slice(index, index + size)));
    }
    parsed.push(...parser.finish());
    expect(parsed).toEqual([event, event]);
    const citation = parsed[0].content.citations![0];
    expect(Array.from(parsed[0].content.text)
      .slice(citation.start_index, citation.end_index).join('')).toBe('A claim.');
  });

  it('accepts old text parts and payloads without source metadata', () => {
    const part: TextPart = { type: StreamTypeEnum.TEXT, text: 'legacy' };
    const event = { type: part.type, content: { text: part.text }, metadata: {} };
    const parser = new NdjsonParser<TextEvent>();
    expect(parser.push(new TextEncoder().encode(JSON.stringify(event)))).toEqual([]);
    expect(parser.finish()).toEqual([event]);
    expect(part.sources).toBeUndefined();
  });
});
