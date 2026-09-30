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

검증 중 하나라도 실패하면 그 자리에서 멈춘다. 실패 상태에서 tag를 만들지 않는다. 원인이
환경 문제로 보이더라도(stale socket 파일, 포트 점유, 캐시 등) 파일 삭제·프로세스 종료·재실행
같은 조치를 스스로 하지 않는다. 사용자에게 다음을 보고하고 지시를 기다린다.

- 무엇이 실패했는지: 실패한 명령, 실패한 테스트 이름, 핵심 오류 메시지.
- 원인 판단과 그 근거: 코드 결함인지 환경 문제인지, 무엇을 확인해서 그렇게 봤는지.
- 조치안: 각 안이 무엇을 바꾸는지와 위험을 한 줄씩. 예: "stale socket 파일을 지우고 재실행",
  "검증을 건너뛰고 tag 진행(CI가 다시 검증)", "릴리스 중단 후 별도 수정".

사용자가 조치안 중 하나를 고르면 그것만 실행하고, 다시 검증이 통과했더라도 tag 전에 "검증
통과, 이대로 tag 진행할까요?"를 한 번 더 확인한다. 검증 실패를 사용자가 보지 못한 채 릴리스가
끝나는 상황을 막기 위해서다.

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

## 5. 배포 완료 확인과 보고

tag push는 배포의 시작일 뿐이다. GitHub Actions의 `publish` job이 npm에 올리고
`release-plugin` job이 plugin 브랜치를 전진시켜야 끝난다. 사용자는 "배포 완료" 보고를 받으면
바로 `npx -y neosql-mcp@X.Y.Z`를 시도하거나 다른 사람에게 알릴 수 있으므로, 다음 세 가지가
실제로 확인된 뒤에만 완료라고 보고한다. 확인 전에는 "배포 진행 중"이라고만 말한다.

1. publish workflow run이 `success`로 끝났다.
2. `npm view neosql-mcp version`이 새 버전을 돌려준다.
3. `refs/heads/plugin-release`가 release tag의 commit을 가리킨다.

확인 방법은 상황에 맞게 고른다. 보통은 `node scripts/wait-for-release.mjs vX.Y.Z`를
백그라운드로 실행하면 workflow 상태와 npm 반영을 함께 지켜보다가 결과를 종료 코드(0 성공,
1 실패·timeout)와 마지막 로그 줄로 알려 준다. workflow는 보통 3~5분 걸린다. 스크립트가 못
쓰이는 환경이면 Actions 페이지와 `npm view`로 같은 세 가지를 직접 확인한다. 어느 쪽이든
자리를 비우거나 사용자에게 확인을 떠넘기지 않는다.

- workflow가 실패·취소됐으면 job 상태와 run 링크를 그대로 보고하고, 임의로 재실행하거나 tag를
  다시 만들지 않는다. 같은 버전은 다시 publish할 수 없으므로 수정 뒤 새 patch로 간다.
- `publish`는 성공했는데 `release-plugin`만 실패한 경우 npm 배포 자체는 끝난 상태다. 복구는
  `docs/npm-publish.md`의 "npm 성공 후 branch 갱신만 실패했을 때"를 따르고, 같은 버전의
  `publish` job을 재실행하지 않는다.
- npm registry 반영이 workflow 성공보다 몇 분 늦을 수 있다. 그 사이 새 버전의 `npx` 실행이
  실패하는 것은 허용된 공백이다.
- 같은 tag가 `.github/workflows/publish-mcp-registry.yml`(공식 MCP Registry 게시)도 실행한다.
  이 결과는 배포 완료 조건이 아니다. npm 반영을 기다리느라 publish workflow보다 늦게 끝날 수
  있으므로 완료 보고에 진행 중·성공·실패와 run 링크를 참고로 덧붙인다. 실패했으면 임의로
  재실행하지 않고 `docs/mcp-registry.md`의 "실패 대응"을 근거로 보고한다.

완료 보고에는 이전·새 버전, 선택 근거 한 줄, version commit SHA와 tag, workflow run 링크와
결과, npm에서 확인한 버전, plugin 브랜치 SHA 일치 여부, MCP Registry 게시 상태를 넣는다.
