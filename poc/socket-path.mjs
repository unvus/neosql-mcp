import os from 'node:os';
import path from 'node:path';

export function getSocketPath() {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\neosql-mcp-poc';
  }
  return path.join(os.tmpdir(), `neosql-mcp-poc-${process.getuid?.() ?? 'x'}.sock`);
}
