# npm 배포 가이드

`neosql-mcp`를 public npm package로 등록하고, MCP host에서
`npx -y neosql-mcp@latest`로 실행할 수 있게 만들기 위한 절차다.

기준 날짜: 2026-05-11

## 현재 패키지 상태

`package.json` 기준 현재 배포 관련 설정은 다음과 같다.

| 항목 | 현재값 | 판단 |
| --- | --- | --- |
| package name | `neosql-mcp` | 2026-05-11 기준 `npm view neosql-mcp version`은 `E404`로 미등록 상태 |
| version | `0.0.1` | 최초 배포 후보로 사용 가능 |
| module type | `module` | TypeScript ESM 패키지 방향과 일치 |
| bin | `neosql-mcp` -> `dist/cli.js` | `npx neosql-mcp` 실행 진입점 |
| build | `tsup`, `src/cli/cli.ts` -> `dist/cli.js` | `tsup.config.ts`에서 shebang 추가 |
| files | `dist`, `README.md`, `LICENSE` | `LICENSE` 파일이 아직 없으면 배포 전 추가 필요 |
| engine | `node >=20` | Node 20 이상 MCP host 환경 필요 |
| prepublishOnly | `npm run build` | publish 시 빌드는 보장되지만 테스트는 수동 실행 필요 |

패키지명 점유 여부는 배포 직전에 다시 확인한다. npm registry 상태는 언제든 바뀔 수
있고, 한 번 publish된 `name@version` 조합은 같은 버전으로 재발행할 수 없다.

```bash
npm view neosql-mcp version
```

`E404`면 아직 미등록 상태다. 버전이 출력되면 이미 등록된 패키지이므로 소유권이 있는지
확인하거나 패키지명을 바꿔야 한다.

## 배포 전 필수 보완

최초 publish 전에 아래 항목은 정리해두는 편이 안전하다.

1. `LICENSE` 파일 추가
   - 현재 `package.json#files`에 `LICENSE`가 포함되어 있다.
   - 실제 파일이 없으면 npm 패키지에 라이선스가 명확히 표시되지 않는다.
   - `package.json`에도 `"license": "..."` 필드를 추가한다.

2. package metadata 보강
   - `description`은 현재 embedded-server와 Streamable HTTP를 언급한다. 현재 구조는
     Electron main의 UDS/Named Pipe RPC로 바뀌었으므로 문구를 최신 아키텍처에 맞춘다.
   - `repository`, `homepage`, `bugs`, `keywords`, `author`를 추가한다.
   - public repository에서 provenance를 쓸 계획이면 `repository` 값이 실제 공개 저장소와
     일치해야 한다.

3. npm 소유 계정 결정
   - 개인 계정으로 배포할지, 조직 scope를 쓸지 결정한다.
   - 현재 이름은 unscoped package인 `neosql-mcp`다.
   - 조직 소유를 명확히 하고 싶으면 `@<org>/neosql-mcp` 같은 scoped package를 고려한다.
     이 경우 MCP host 설정의 `npx` args도 같이 바뀐다.

4. README 사용자 안내 확인
   - 설치된 NeoSQL Desktop이 필요하다는 전제.
   - `--profile dev` 등 CLI 옵션.
   - MCP host 설정 예시는 `docs/mcp-client-config.md`와 일치해야 한다.

5. 배포 권한과 2FA 준비
   - npm 계정 생성 및 로그인.
   - publish 권한이 있는 owner 또는 maintainer 확인.
   - 2FA가 켜져 있으면 publish 시 OTP가 필요할 수 있다.

## 1회성 준비

로컬에서 최초 배포할 때 필요한 기본 준비다.

```bash
npm login
npm whoami
npm config get registry
```

registry는 public npm registry여야 한다.

```text
https://registry.npmjs.org/
```

조직 scoped package로 바꾸는 경우에는 최초 publish 때 public 접근 권한을 명시한다.

```bash
npm publish --access public
```

현재처럼 unscoped package인 `neosql-mcp`는 public package로만 배포된다. 그래도 최초
배포 명령에 `--access public`을 붙여도 무방하다.

## 배포 전 검증 체크리스트

배포 직전에는 clean working tree에서 시작한다.

```bash
git status --short
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm test
npm run build
```

`npm test`가 전체 테스트라면 `test:unit`, `test:integration`을 별도로 반복 실행한 뒤
마지막에 `npm test`로 한 번 더 확인한다. binary entry 또는 `dist`에 영향이 있는 변경은
`test:integration`을 반드시 포함한다.

패키지에 실제로 포함될 파일도 확인한다.

```bash
npm pack --dry-run
```

확인할 포인트:

- `dist/cli.js`가 포함되어야 한다.
- `dist/cli.js` 첫 줄에 `#!/usr/bin/env node`가 있어야 한다.
- `README.md`와 `LICENSE`가 포함되어야 한다.
- `src/`, `tests/`, `docs/`, `.env`, `.mcp.json`, local log, `node_modules/`는 포함되지
  않아야 한다.
- source map을 공개하지 않을 계획이면 `dist/*.map` 포함 여부를 보고 `tsup.config.ts` 또는
  `files` 정책을 조정한다.

2026-05-11 현재 dry-run 결과는 다음 4개 파일만 포함한다.

- `package.json`
- `README.md`
- `dist/cli.js`
- `dist/cli.js.map`

따라서 최초 배포 전 `LICENSE` 추가 여부와 source map 공개 여부를 결정해야 한다.

실제 tarball까지 만들어 확인하고 싶으면 다음을 사용한다.

```bash
npm pack
```

생성된 `neosql-mcp-<version>.tgz`는 배포 검증용 산출물이다. commit에는 포함하지 않는다.

## 버전 결정

npm은 같은 `name@version`을 다시 publish할 수 없다. 배포 전 버전이 확정됐는지 확인한다.

```bash
npm view neosql-mcp versions --json
```

최초 배포는 현재 `0.0.1`을 사용할 수 있다. 이후 변경은 semver 기준으로 올린다.

```bash
npm version patch
npm version minor
npm version major
```

`npm version`은 기본적으로 `package.json`, `package-lock.json`을 수정하고 git tag를 만든다.
자동 tag가 싫으면 `--no-git-tag-version`을 사용한다.

## publish 절차

최초 public 배포:

```bash
npm publish --access public
```

2FA OTP를 명시해야 하는 환경이면:

```bash
npm publish --access public --otp <one-time-password>
```

pre-release나 내부 검증용 태그로 먼저 올리고 싶으면 `latest` 대신 별도 dist-tag를 쓴다.

```bash
npm publish --access public --tag next
```

검증 후 latest로 승격:

```bash
npm dist-tag add neosql-mcp@<version> latest
```

## 배포 후 검증

publish가 끝나면 registry와 실제 실행 경로를 확인한다.

```bash
npm view neosql-mcp version
npm view neosql-mcp bin
npm pack neosql-mcp@latest --dry-run
npx -y neosql-mcp@latest
```

`npx -y neosql-mcp@latest`는 stdio MCP server를 실행하므로 일반 터미널에서는 대기 상태처럼
보일 수 있다. 실제 동작 검증은 `docs/e2e-manual.md`의 MCP host 절차로 확인한다.

MCP host 설정도 최신 패키지명과 맞춘다.

```json
{
  "mcpServers": {
    "neosql": {
      "command": "npx",
      "args": ["-y", "neosql-mcp@latest"]
    }
  }
}
```

dev profile이 필요하면:

```json
{
  "mcpServers": {
    "neosql-dev": {
      "command": "npx",
      "args": ["-y", "neosql-mcp@latest", "--profile", "dev"]
    }
  }
}
```

## CI 배포 선택지

처음에는 로컬 수동 publish가 단순하다. 다만 공개 패키지로 계속 운영할 생각이면 GitHub
Actions 또는 GitLab CI에서 publish하는 편이 낫다.

권장 방향:

- Git tag 또는 GitHub Release 생성 시 publish.
- `npm ci`, lint, typecheck, test, build를 모두 통과한 뒤 publish.
- 가능하면 npm trusted publishing 또는 provenance를 사용.
- 장기 npm token을 쓰는 경우 권한을 publish 전용으로 제한하고 주기적으로 교체.

provenance를 쓰려면 public repository, 지원되는 cloud CI runner, 올바른 `repository`
metadata가 필요하다.

```bash
npm publish --provenance --access public
```

trusted publishing을 설정하면 지원 환경에서 provenance가 자동 생성될 수 있다.

## 문제 발생 시 대응

잘못된 버전을 publish한 경우 같은 버전을 덮어쓸 수 없다.

- 단순 README나 metadata 문제: 수정 후 새 patch version publish.
- 사용자에게 설치하지 말라고 알려야 하는 문제: `npm deprecate` 사용.
- 민감정보 포함: 즉시 token 폐기, repository history 점검, npm unpublish 정책 확인.
- 로컬 npm cache 권한 문제: `npm_config_cache`를 임시 디렉토리로 지정해 pack/publish 전
  검증 명령을 다시 실행한다.

deprecate 예시:

```bash
npm deprecate neosql-mcp@0.0.1 "Use 0.0.2 or later"
```

cache 우회 예시:

```bash
env npm_config_cache=/private/tmp/neosql-mcp-npm-cache npm pack --dry-run
```

## 참고 문서

- npm publish: https://docs.npmjs.com/cli/v11/commands/npm-publish/
- package.json: https://docs.npmjs.com/cli/v11/configuring-npm/package-json
- npm provenance: https://docs.npmjs.com/generating-provenance-statements
- trusted publishing: https://docs.npmjs.com/trusted-publishers
- MCP host 설정: `docs/mcp-client-config.md`
- 수동 e2e 검증: `docs/e2e-manual.md`
