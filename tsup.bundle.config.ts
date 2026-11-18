import { defineConfig } from 'tsup';

/**
 * NeoSQLEnterprise 앱에 넣는 한 파일 번들(neosql 저장소 계획 D27). npm 패키지(dist/)와 따로 만든다.
 *
 * 앱은 이 파일을 자기 실행 파일로 돌린다(`ELECTRON_RUN_AS_NODE=1 <앱> neosql-mcp.cjs --profile=enterprise`) — 고객 PC 에
 * Node.js 도 인터넷(npm)도 없어도 되고, 버전이 늘 앱과 맞는다. 그래서 의존성을 모두 안에 넣는다(noExternal).
 * CJS 로 낸다 — 의존성(pino 등)이 쓰는 require · __dirname 이 ESM 번들에서는 없다.
 */
export default defineConfig({
  entry: { 'neosql-mcp': 'src/cli/cli.ts' },
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  outDir: 'bundle',
  outExtension: () => ({ js: '.cjs' }),
  clean: true,
  sourcemap: false,
  minify: false,
  splitting: false,
  shims: false,
  dts: false,
  noExternal: [/.*/],
});
