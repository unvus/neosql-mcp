export interface SseEvent {
  id?: string;
  event?: string;
  data: string;
}

export class SseParser {
  private buffer = '';

  feed(chunk: string | Uint8Array): SseEvent[] {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    this.buffer = `${this.buffer}${text}`.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const events: SseEvent[] = [];
    let separatorIndex = this.buffer.indexOf('\n\n');
    while (separatorIndex !== -1) {
      const block = this.buffer.slice(0, separatorIndex);
      this.buffer = this.buffer.slice(separatorIndex + 2);
      const event = parseEventBlock(block);
      if (event) events.push(event);
      separatorIndex = this.buffer.indexOf('\n\n');
    }
    return events;
  }

  end(): SseEvent[] {
    this.buffer = '';
    return [];
  }
}

const parseEventBlock = (block: string): SseEvent | undefined => {
  if (block.trim() === '') return undefined;

  let id: string | undefined;
  let event: string | undefined;
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;

    const colonIndex = line.indexOf(':');
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'id') id = value;
    else if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }

  const parsed: SseEvent = { data: dataLines.join('\n') };
  if (id !== undefined) parsed.id = id;
  if (event !== undefined) parsed.event = event;
  return parsed;
};
