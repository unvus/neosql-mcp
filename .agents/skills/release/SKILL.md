---
name: release
description: neosql-mcp의 미배포 변경을 분석해 다음 버전(patch/minor/major)을 추천하고, 사용자 승인 또는 지정 버전으로 npm version → git push → tag push까지 수행해 GitHub Actions publish를 트리거한다. "push하고 버전 올려줘", "배포해줘", "릴리스", "publish", "버전업", "patch/minor/major 올려줘", "1.9.0으로 올려줘"처럼 버전 bump나 npm 배포를 요청하면 반드시 이 스킬을 사용한다. 커밋만 요청하거나 push만 요청하면 사용하지 않는다.
---

# Release

미배포 변경을 기준으로 버전을 추천하고, 사용자가 확정한 버전으로 `npm version`을 실행한 뒤
commit과 tag를 push한다. tag push가 `.github/workflows/publish.yml`을 트리거해 npm publish와
plugin 브랜치 전진을 자동으로 수행하므로, 이 스킬은 **로컬에서 수동 publish를 하지 않는다**.

스킬 실행 요청만으로 추천 버전을 확정하지 않는다. 사용자가 버전이나 증가 종류를 승인하거나
지정한 뒤에만 `npm version`과 push를 실행한다. 상세 배포 원칙은 `docs/npm-publish.md`의
"버전과 태그", "Plugin 릴리스" 절이 기준이다.

## 1. 상태 확인

아래를 한 번에 확인하고 문제가 있으면 멈춘다.

```bash
git status --short --branch
git fetch origin --tags
git log --oneline "$(git describe --tags --abbrev=0 --match 'v*')..HEAD"
node -p "require('./package.json').version"
npm view neosql-mcp version
```

- 브랜치가 `main`이 아니면 중단하고 확인한다. release tag는 `main`에서만 만든다.
- working tree가 clean이 아니면 중단한다. release commit에 섞이면 안 되는 변경을 대신
  commit하거나 stash하지 않는다. 사용자에게 정리 여부를 묻는다.
- `origin/main`보다 뒤처져 있으면 중단한다. 먼저 pull이 필요한지 사용자와 확인한다.
- `package.json` 버전, 최신 `v*` tag, npm registry의 `latest` 세 값이 서로 다르면 왜 다른지
  설명할 수 있어야 한다. 설명이 안 되면 추측해서 올리지 않는다.
- publish workflow가 `v*` tag push로 트리거되는지 `.github/workflows/publish.yml`에서 다시
  확인한다. workflow가 바뀌어 있으면 이 스킬의 절차보다 workflow를 우선한다.

## 2. 변경 분석과 버전 추천

최신 `v*` tag 이후 `HEAD`까지의 commit을 조사한다. 제목만 보지 말고 필요한 diff를 본다.
이 패키지에서 사용자에게 배포되는 것은 `dist/`(즉 `src/`), `README.md`, `LICENSE`,
`npm-shrinkwrap.json`, 그리고 `plugins/neosql-mcp/`다. 이 범위에 영향이 없는 변경(내부 문서,
테스트, CI)만 있으면 배포가 필요 없다고 말한다.

추천 기준. 최종 선택은 사용자에게 있다.

- **patch** `X.Y.Z → X.Y.(Z+1)`: 오류 수정, 문구·문서 변경, README 변경, `package.json`
  메타데이터 변경, 의존성 보안 업데이트, 동작이 같은 리팩터링. README와 package.json은 npm
  페이지에 그대로 노출되므로 문서만 바뀌어도 publish 가치가 있다.
- **minor** `X.Y.Z → X.(Y+1).0`: 새 MCP tool, 새 CLI 옵션, 기존 tool의 입력·출력 확장, 새
  MCP host 지원처럼 사용자가 체감하는 기능 추가. patch와 minor가 섞이면 minor.
- **major** `X.Y.Z → (X+1).0.0`: tool 이름·입력 스키마·응답 형식 변경, CLI 옵션 제거, 지원
  Node 버전 상향, upstream 계약 변경처럼 기존 MCP host 설정이나 Desktop 버전과 호환이 깨질
  때. 사용자는 호환성 파괴가 없어도 제품 판단으로 major를 고를 수 있다.
- commit type 접두어(`feat`/`fix`)는 참고일 뿐이다. `docs:`로 표시된 README 변경도 배포
  대상이고, `feat:`로 표시된 내부 리팩터링은 patch일 수 있다.

다음을 한 번에 제시하고 응답을 기다린다.

- 현재 버전, 최신 tag, npm `latest` (다르면 그 이유).
- 미배포 commit 목록과 배포 범위에 영향을 준 것만 추려 한 줄씩.
- 추천 버전과 증가 종류, 핵심 근거 두세 줄.
- tag를 만들기 전에 로컬 검증(`npm run lint`, `npm run typecheck`, `npm test`,
  `npm run build`)을 실행할지 여부. CI가 tag push 뒤 같은 검증을 다시 돌리므로 필수는
  아니지만, 실패하면 이미 push된 tag를 되돌릴 수 없어 새 patch가 필요해진다는 점을 한 줄로
  알린다. 기본 추천은 "실행"이다.
- 안내 예: "현재 1.8.7이고 미배포 commit 3개는 README·package.json 메타데이터 변경이라
  1.8.8(patch)을 추천합니다. tag 전에 lint/typecheck/test/build를 로컬에서 돌릴까요?
  이대로 진행할까요? 다른 버전을 지정해도 됩니다."

응답 전에는 `npm version`, push, tag를 실행하지 않는다. 응답 없음은 승인이 아니다.
버전과 검증 여부를 한 번에 물어서 승인 왕복을 한 번으로 끝낸다.

## 3. 버전 확정 규칙

- 사용자가 처음부터 `patch`/`minor`/`major` 또는 정확한 버전을 지시했다면 이미 선택한
  것이다. 분석상 추천이 다르면 한 줄로 알리되 같은 선택을 다시 승인받지 않는다. "추천대로
  진행"도 승인이다.
- 사용자가 지정한 버전이 추천보다 우선한다. 현재 버전보다 낮거나 같거나, npm에 이미 있는
  버전일 때만 의도를 확인한다. 같은 `name@version`은 다시 publish할 수 없다.
- 이번 대화에서 이미 승인받은 버전은 다시 묻지 않고 이어서 진행한다.

## 4. 실행

승인된 버전으로 아래를 순서대로 실행한다. 각 단계가 실패하면 다음 단계로 가지 않는다.

사용자가 로컬 검증을 원했을 때만 먼저 실행한다. 검증을 원하지 않는다고 답했으면 아무
검증도 돌리지 않고 곧바로 `npm version`부터 시작한다. 검증을 건너뛰기로 한 사용자에게
"그래도 test는 돌리겠다"는 식으로 임의 추가하지 않는다.

```bash
npm run lint && npm run typecheck && npm test && npm run build   # 사용자가 검증을 원한 경우만
```

검증 중 하나라도 실패하면 멈추고 결과를 보고한다. 실패 상태에서 tag를 만들지 않는다.

```bash
npm version <patch|minor|major|X.Y.Z>
git push
git push origin v<X.Y.Z>
```

- `npm version`은 `package.json`, `npm-shrinkwrap.json`을 올리고, `version` lifecycle이
  `scripts/sync-plugin-version.mjs`로 plugin manifest와 `.mcp.json`의 npm pin을 같은 버전으로
  맞춰 stage한 뒤, `X.Y.Z` 메시지의 commit과 `vX.Y.Z` tag를 만든다. 이 파일들을 직접 편집하지
  않는다.
- `npm version` 직후 `git show --stat HEAD`로 commit에 `package.json`,
  `npm-shrinkwrap.json`, `plugins/neosql-mcp/.claude-plugin/plugin.json`,
  `plugins/neosql-mcp/.mcp.json` 네 파일이 들어갔는지 확인한다.
- 첫 `git push`가 미배포 commit과 version commit을 함께 올린다. tag push는 생략하지 않는다.
  tag push가 곧 배포 동작이다.
- tag를 push한 뒤에는 되돌리지 않는다. 잘못 올렸으면 새 patch 버전으로 고친다. tag 삭제나
  force push는 하지 않는다.

## 5. 배포 후 확인과 보고

tag push 직후에는 workflow가 아직 실행 중이므로 결과를 단정하지 않는다.

- Actions 페이지 링크를 안내한다: `https://github.com/unvus/neosql-mcp/actions`.
- 몇 분 뒤 확인할 명령을 안내하거나 사용자가 원하면 대신 실행한다.

```bash
npm view neosql-mcp version
git rev-parse 'vX.Y.Z^{commit}'
git ls-remote origin refs/heads/plugin-release
```

registry 반영이 늦어 새 버전의 `npx` 실행이 잠시 실패할 수 있다. 이건 허용된 공백이다.
`publish` job은 성공했는데 `release-plugin`만 실패한 경우의 복구는 `docs/npm-publish.md`의
"npm 성공 후 branch 갱신만 실패했을 때"를 따르고, 같은 버전의 `publish`를 재실행하지 않는다.

완료 보고에는 이전·새 버전, 선택 근거 한 줄, version commit SHA와 tag, push 결과, Actions
링크를 넣는다.
