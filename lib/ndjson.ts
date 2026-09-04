export class NdjsonParser<T> {
  private readonly decoder = new TextDecoder();
  private buffer = '';

  push(chunk: Uint8Array): T[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    return lines.flatMap((line) => this.parse(line));
  }

  finish(): T[] {
    this.buffer += this.decoder.decode();
    const finalLine = this.buffer;
    this.buffer = '';
    return this.parse(finalLine);
  }

  private parse(line: string): T[] {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line) as T];
    } catch {
      return [];
    }
  }
}
