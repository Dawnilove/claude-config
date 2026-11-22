# ROADMAP (규모: S)

claude-config의 진행과 "나중에" 항목. 결정의 원문은 `docs/결정_기록.md`에 있다. 이 파일은 다음에 할 일과 날짜만 둔다.

## 끝난 일

| 날짜 | 일 | 커밋 |
|---|---|---|
| 2026-11-18 | 외부 저장소 17개 흡수 계획 7단계 (설치 3, 가드·/ship, /recall, plugins/ 정리·superpowers-lite, humanizer-ko, 띠 제안·인계 단추, ruflo·slides 규칙) | 1aac686 ~ a31a839 |
| 2026-11-18 | 비밀 파일 가드 오탐 수정, 위험 명령 확인을 선택 카드로 (원격 화면 대응), 턴 중단 시 멈춤 수정 | fdbfa35 ~ 5e39521 |

## 확인할 것

- [x] 앱 재시작: 새 플러그인 경로가 적용되었다 (2026-11-18)
- [x] 위험 명령의 선택 카드가 뜬다 (2026-11-18, 시험 폴더 삭제)
- [x] 중단(Esc) 뒤에도 다음 위험 명령을 다시 붙잡는다 (2026-11-18)
- [x] 위험 명령 확인 카드: 잘못된 카드가 또 나와서 지웠다 (2026-11-19). 파일을 깨뜨리는 명령 거부는 남겼다
- [ ] graphify: 프로젝트 1개에서 `/graphify .`를 써 본다. 쓸모가 있으면 그 프로젝트에만 `graphify hook install`(커밋 때 다시 만들기)을 켠다. Claude Code 훅(`graphify claude install`)은 쓰지 않는다
- [x] 앱 권한 `ask` 규칙: auto 모드에서도 승인 창이 1개만 뜬다. 묶음 명령(`S=… && rm -rf $S`)도 걸린다 (2026-11-19)
- [ ] 띠의 노력 수준 알약, 컨텍스트 50% 이상의 `인계 ▸`, 비밀 파일 가드, 새 스킬(`/recall`, superpowers-lite, humanizer-ko)
- [ ] 다른 PC: README 3절의 갱신 명령 실행 (플러그인 폴더가 `claude/plugins/`로 옮겨졌다, 2026-11-19)
- [x] Codex판·Antigravity판: 시험 폴더에서 규칙·하위 에이전트 4개·스킬을 읽는다. Antigravity 알림 훅이 들어간다. Codex 승인 규칙이 위험 명령에 `prompt`를 낸다 (2026-11-19)
- [ ] Codex 알림 훅: 실제 설치 뒤 `/hooks`에서 신뢰하고 알림이 들어오는지 본다 (시험 못 함: 신뢰가 대화형이다)
- [ ] 이 PC에 Codex판·Antigravity판을 실제로 설치한다 (README 8절)
- [x] Orca판 `orca/`: 플러그인 3개 만들었다. `setup.ps1 -Agent orca`는 건조 실행과 승인 요구(종료 코드 3)까지 시험했다 (2026-11-21)
- [x] Orca 기능과 겹침 점검과 켜기·끄기 (2026-11-21, README 9-1·9-2). 시험: agent-band 12개, agent-guard 7개 통과. `agent-guard`는 session-board 가드와 중복이라 session-board가 로드된 PC에서는 설치를 건너뛴다. 검토 결과 7건을 고쳤다 (원본 session-board에도 있는 가드의 한계 3건은 아직 안 고침: 비밀 파일에 쓰는 명령 오탐, PowerShell 도구의 `sed -i`, `Grep` 도구의 `.env`)
- [x] Orca에서 결재 모아 보기 (2026-11-21): chat UI는 Orca의 에이전트 대시보드("확인 필요" 칸). 터미널 모드의 Claude는 session-board의 띠와 결재함 패널이 그대로 뜬다 (사용자 화면으로 확인). 그래서 `agent-band`와 `agent-guard`는 선택 설치로 돌렸다 (`setup.ps1`이 설치하지 않고 명령만 보인다)
- [x] `/refresh`의 Orca 절차: `claude/skills/refresh/orca.md` (세션 확인·열기·정리를 `orca worktree`·`orca agent`로). `/handoff`와 `/recall`은 Orca에서 그대로 돈다 (2026-11-21). 읽기 명령만 시험했다
- [x] Orca에서 `/refresh` 절차를 실제로 시험했다 (2026-11-22): `worktree create --agent claude`(Haiku, low)로 자식을 열고 부모 연결(`childWorktreeIds`), `agent read`로 답 읽기, `worktree set --workspace-status completed`까지 모두 됐다. 시험하려고 claude-config를 Orca 프로젝트로 등록했다
- [x] Orca 터미널에서는 session-board 패널을 자동으로 열지 않는다 (2026-11-22). 띠의 `세션 ▸`나 `/session_board`로 연다
- [x] 이 PC의 `CLAUDE_CODE_PLUGIN_DIRS`는 `claude\plugins`다 (Orca 채팅 세션에서 확인, 2026-11-21). 다른 PC는 `setup.ps1 -SkipPlugins`가 바꾼다

## 마감이 있는 일

| 마감 | 일 |
|---|---|
| 2026-12-18 | `/improve` 1달 시험 끝. `/ponytail-audit`와 비교해 검토 선택표에 1개만 남긴다 |

## 보관함 (조건이 생기면 다시 본다)

| 항목 | 다시 볼 조건 |
|---|---|
| vectorize-io/hindsight (기억 서버) | Docker를 배운 뒤 |
| elementalsouls/Claude-BugHunter | CTF·버그바운티를 시작할 때 |
| google-research/paper-orchestra | 논문을 쓸 때 (별도 폴더에서 시험) |
| google-research/harness2 | 논문으로만 읽는다 |
