# ITMWEHATEGUSIK 작업 인계

## 현재 사용자 지시

- 로컬 CI/CD를 ChatGPT 세션과 독립적인 스크립트로 준비해 달라는 요청이다.
- 사용자는 "너가 하지 말고"라고 지정했다. 이번 단계는 파일 작성과 정적 문법 검증까지다. 사용자가 이후 "푸시부탁"으로 자동 배포 준비 코드의 커밋·푸시를 명시적으로 허용했다. 자동 감시 시작, 자동 pull/fetch 루프, 서버 재시작, 시작프로그램 등록은 후속 실행 요청 전까지 수행하지 않는다.
- 다른 작업자가 이어갈 수 있도록 상태와 미검증 항목을 유지한다.

## 위치와 현재 상태

- 저장소: C:\Users\rudgh\Documents\GS강서타워 점심 돌림판
- 원격: https://github.com/LEEKYOUNGHWA/ITMWEHATEGUSIK.git
- 자동 배포 준비 직전 main HEAD: 8f4fdfe (이전 기능 병합·푸시 완료)
- 자동 배포 준비 변경은 사용자 요청에 따라 main에 커밋·푸시하는 대상이다. 완료된 커밋은 git log로 확인한다. 기존 수동 개발 서버를 이 작업에서 종료하거나 재시작하지 않았다.
- 핵심 파일: scripts/auto-deploy.ps1, package.json의 auto:* 명령, server/index.mjs의 선택적 관리 stdin 종료와 health revision, README.md의 로컬 자동 배포 절.

## 설계

- origin/main을 15분마다 확인하고 별도 .deploy/releases worktree에서 npm ci/test/build 후 임시 포트 기동 검사, 통과 시 3000번 서버 교체.
- 원본 작업 폴더를 pull/reset하지 않는다. 실제 서비스 커밋은 .deploy/state.json에 기록한다.
- 자동 모드는 공통 data 경로와 data/restaurants.json을 사용한다. 초기 후보만 config/restaurants.json에서 복사한다. 채팅·프로필·이력·후보 JSON을 업데이트마다 초기화하지 않는다.
- 실행 실패 시 기존 서버 유지, 교체 기동 실패 시 이전 정상 배포로 복구 시도. 데이터 사본을 자동 복원해 새 기록을 덮어쓰지 않는다.
- 다른 프로세스가 3000번을 점유하면 자동으로 죽이지 않고 중지한다. 최초에는 사용자가 기존 dev 서버를 종료해야 한다.
- auto:start는 숨겨진 별도 PowerShell, auto:run은 전면 실행. auto:stop/status/check 제공. Windows 부팅 자동 실행은 등록하지 않는다.

## 검증 완료 / 남은 작업

- 완료: PowerShell Parser로 scripts/auto-deploy.ps1 구문 오류 없음. node --check로 server/index.mjs 구문 오류 없음.
- 미수행: 자동 배포 스크립트 실행, 실제 GitHub 감시, 새 배포 설치·테스트·빌드, 임시 포트 smoke, 실제 서버 교체와 실패 복구, 세션 종료 뒤 지속 동작. 이를 성공했다고 보고하지 않는다.
- 실행을 새로 허가받으면 코드 검토 후 임시 로컬 Git 저장소와 별도 포트에서 성공/실패/재시도/중지/데이터 보존을 먼저 검증한다. 기존 운영 자료를 테스트 데이터로 수정하지 않는다.
- 최초 실행 전 원격 main에 자동 배포 코드가 포함됐는지 확인한다. 준비 전 커밋에는 health revision·관리 종료 신호가 없어 smoke 검사가 통과하지 않는다.
- scripts/auto-deploy.ps1은 작업 중인 실행 파일이다. 인증·의존성 설치·PowerShell 프로세스 처리의 실환경 검증을 이어간다.
- 사용자 데이터(data, .deploy)는 커밋하거나 원격으로 전송하지 않는다. 원격/로컬 소스를 강제 초기화하지 않는다.

## 동시 변경 주의

- 자동 배포 파일을 작성하는 동안 실행 중인 정보등록 화면에서 config/restaurants.json도 변경된 것으로 확인됐다. 이 파일은 이번 CI/CD 준비 코드가 수정한 것이 아니다. 사용자의 최신 후보 정보를 보존하고 임의로 되돌리거나 배포 초기값으로 덮어쓰지 않는다.
- 다음 작업자는 git diff를 구분하여 자동 배포 코드와 사용자 후보 정보의 커밋 범위를 검토한다. 이번 커밋·푸시 범위는 자동 배포 준비 코드와 설명·인계 파일이다. 실행 중 수정된 config/restaurants.json은 로컬에 보존하고 포함하지 않는다.
