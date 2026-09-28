# release-plugin npm 조회 실패와 처리 결정

작성: 2026-09-29. 대상: `.github/workflows/publish.yml`의 `release-plugin` job.

## 확인된 현상

`1.8.3`, `1.8.4` 릴리스에서 `publish` job은 성공했지만, 후속 `release-plugin` job의
"Confirm pinned package exists on npm" 단계가 실패했다. 마지막 branch 갱신 단계는
건너뛰었으므로 `plugin-release`가 해당 릴리스 commit으로 전진하지 않았다.

기존 확인 단계는 `npm view neosql-mcp@<version> version`을 최대 5회 실행하고 실패할 때마다
5초씩 대기했다. 총 sleep은 25초이며 실제 경과 시간에는 npm 조회 시간도 포함된다.

아래 시각은 모두 2026-09-28 UTC다.

| 릴리스 | `Publish to npm` 종료 | 확인 단계 구간 | registry `time` 기록 | 시각 차이 |
| --- | --- | --- | --- | --- |
| `1.8.3` | 16:33:31Z | 16:33:49Z ~ 16:34:17Z | 16:34:47Z | 약 76초 |
| `1.8.4` | 19:28:57Z | 19:29:07Z ~ 19:29:34Z | 19:32:06Z | 약 189초 |

근거:

- [1.8.3 Actions 실행](https://github.com/unvus/neosql-mcp/actions/runs/36451831096)
- [1.8.4 Actions 실행](https://github.com/unvus/neosql-mcp/actions/runs/36472470599)
- [npm registry metadata](https://registry.npmjs.org/neosql-mcp)의 `time` 필드
- 사용자가 제공한 최초 `1.8.4` 실행 로그: 조회 5회 모두 `E404`, `No match found for version 1.8.4`.

검토 당시 Actions API의 `1.8.4` 실행은 `run_attempt: 1`이었다. 제공된 로그는 최초 실패
기록이며, 반영 이후 재실행 실패의 근거는 아니다. 검토 시점의 별도 npm cache를 사용한
`npm view neosql-mcp@1.8.4 version --prefer-online` 조회는 성공했다.

이 기록은 배포 성공 직후 registry 조회 가능 시점이 늦어졌다는 해석을 뒷받침한다.
다만 registry 내부 지연의 원인이나 실패 당시 runner의 cache 영향을 확정하지는 않는다.

## 결정

정식 `plugin-release` branch 전진의 조건은 `publish` job 성공으로 한다.
후속 job의 npm 조회 단계를 제거하며, 조회에만 쓰던 step output도 제거한다.
대기 시간 확대와 스케줄 기반 reconcile은 추가하지 않는다.

plugin은 `npx -y neosql-mcp@<version>`으로 실행된다. branch 갱신 직후 registry 반영이
늦으면 사용자가 해당 버전을 내려받지 못하는 짧은 구간이 생길 수 있다. 사용자는 이
가용성 공백을 허용하기로 했다. registry 반영 후 다시 실행할 수 있다.

유지하는 조건:

- tag push의 `publish` job이 성공해야 정식 branch를 전진시킨다. 실패·취소 시 전진하지 않는다.
- plugin 파일 구성과 package/plugin/pin 버전, tag 이름 일치를 검사한다.
- 기존 branch가 release commit의 조상일 때만 fast-forward한다. force push하지 않는다.
- `workflow_dispatch`는 npm 배포를 건너뛰고 시험 branch `codex/plugin-release-check`만
  갱신한다. 이 경로도 npm 조회는 하지 않으며 실제 `plugin-release`는 바꾸지 않는다.

```text
publish 성공 → plugin 파일·버전 검사 → plugin-release fast-forward
```

## 검증과 적용

- workflow에서 npm 조회와 사용하지 않는 candidate output이 제거됐는지 확인한다.
- publish 성공 조건, 수동 시험 branch 분리, 파일·버전 검사, fast-forward 제한을 확인한다.
- 다음 릴리스에서 `release-plugin` 성공 및 `plugin-release` SHA와 tag commit 일치를 확인한다.
- workflow 변경은 새 release tag에 포함돼야 적용된다. 기존 `v1.8.4` 실행을 재실행하면
  기존 npm 조회 단계가 그대로 실행되며, 이 수정만으로 기존 실패가 자동 복구되지는 않는다.
- 기존 릴리스 복구는 `docs/npm-publish.md`의 실패 job 재실행 또는 수동 branch 갱신 절차를 따른다.

## 진행 상태

- [x] npm 조회 단계와 전용 step output 제거
- [x] 배포·plugin 문서에 결정과 허용한 가용성 공백 반영
- [ ] 다음 릴리스에서 `release-plugin` 성공 및 branch/tag SHA 일치 확인
