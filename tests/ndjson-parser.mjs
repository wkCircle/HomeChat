import assert from 'node:assert/strict';
import { NdjsonParser } from '../lib/ndjson.ts';

const parser = new NdjsonParser();
const encoder = new TextEncoder();
const events = [
  ...parser.push(encoder.encode('{"sequence":1')),
  ...parser.push(encoder.encode('}\n{malformed}\n{"sequence":2}\n{"sequence"')),
  ...parser.push(encoder.encode(':3}')),
  ...parser.finish(),
];

assert.deepEqual(events, [
  { sequence: 1 },
  { sequence: 2 },
  { sequence: 3 },
]);

console.log('NDJSON split/multiple/malformed/final-buffer cases passed');
