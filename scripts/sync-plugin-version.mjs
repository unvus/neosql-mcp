import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const manifestPath = 'plugins/neosql-mcp/.claude-plugin/plugin.json';
const mcpPath = 'plugins/neosql-mcp/.mcp.json';
const { version } = readJson('package.json');
const manifest = readJson(manifestPath);
const mcp = readJson(mcpPath);
const server = mcp.mcpServers?.neosql;
const matches = server?.args?.filter((arg) => /^neosql-mcp(?:@[^\s]+)?$/.test(arg));

if (typeof version !== 'string' || !version) {
  throw new Error('package.json must contain a version');
}
if (server?.command !== 'npx' || matches?.length !== 1) {
  throw new Error('Expected exactly one neosql-mcp launcher argument in the npx server');
}

manifest.version = version;
server.args = server.args.map((arg) => (arg === matches[0] ? `neosql-mcp@${version}` : arg));
for (const [path, value] of [
  [manifestPath, manifest],
  [mcpPath, mcp],
]) {
  writeFileSync(new URL(path, root), `${JSON.stringify(value, null, 2)}\n`);
}
