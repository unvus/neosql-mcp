export interface SseEvent {
  id?: string;
  event?: string;
  data: string;
}

export class SseParser {
  feed(_chunk: string | Uint8Array): SseEvent[] {
    throw new Error('SseParser.feed: not implemented');
  }

  end(): SseEvent[] {
    throw new Error('SseParser.end: not implemented');
  }
}
