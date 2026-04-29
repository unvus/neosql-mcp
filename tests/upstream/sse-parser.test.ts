import { describe, it, expect } from 'vitest';
import { SseParser, type SseEvent } from '../../src/upstream/sse-parser.js';

describe('SseParser', () => {
  it('parses a single complete event in one chunk', () => {
    const parser = new SseParser();
    const events = parser.feed('id: 1\nevent: tick\ndata: {"x":1}\n\n');
    expect(events).toEqual<SseEvent[]>([
      { id: '1', event: 'tick', data: '{"x":1}' },
    ]);
  });

  it('buffers partial chunks and emits when block completes', () => {
    const parser = new SseParser();
    const first = parser.feed('id: 1\nevent: tick\ndata: par');
    expect(first).toEqual([]);
    const second = parser.feed('tial\n\n');
    expect(second).toEqual<SseEvent[]>([
      { id: '1', event: 'tick', data: 'partial' },
    ]);
  });

  it('joins multi-line data fields with newlines', () => {
    const parser = new SseParser();
    const events = parser.feed('data: line1\ndata: line2\n\n');
    expect(events).toEqual<SseEvent[]>([{ data: 'line1\nline2' }]);
  });

  it('ignores comment lines starting with ":"', () => {
    const parser = new SseParser();
    const events = parser.feed(': keep-alive\nid: 1\nevent: t\ndata: x\n\n');
    expect(events).toEqual<SseEvent[]>([{ id: '1', event: 't', data: 'x' }]);
  });

  it('omits id and event when not present in the block', () => {
    const parser = new SseParser();
    const events = parser.feed('data: only-data\n\n');
    expect(events).toEqual<SseEvent[]>([{ data: 'only-data' }]);
  });

  it('discards an unterminated trailing block on stream end', () => {
    const parser = new SseParser();
    const fed = parser.feed('id: 1\ndata: x\n');
    expect(fed).toEqual([]);
    const ended = parser.end();
    expect(ended).toEqual([]);
  });
});
