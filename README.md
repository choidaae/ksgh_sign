# 연수 등록부 서명·관리 웹앱

화면은 GitHub Pages에서, 스프레드시트 읽기·쓰기는 Google Apps Script에서 처리합니다.

```
브라우저(GitHub Pages)                Apps Script 웹앱            스프레드시트
  index.html  서명 화면
  admin.html  관리 화면   ──POST──▶   doPost → 기존 함수  ──▶   마스터 명단 / 등록부 탭
  api.js      호출기                  (서명 이미지 삽입)
  config.js   빌드 시 생성
```

서명 이미지를 셀 위에 얹는 `insertImage`는 Apps Script에만 있는 기능이라, 시트를 다루는 코드는 그대로 두고 화면만 밖으로 꺼냈습니다. 덕분에 서비스 계정도 개인키도 필요 없습니다.

## 폴더

| 경로 | 설명 |
| --- | --- |
| `public/index.html` | 서명 화면 (기존 SignApp) |
| `public/admin.html` | 관리 화면 (기존 AdminApp) |
| `public/api.js` | `google.script.run`을 대신하는 호출기 |
| `apps-script/Code.gs` | 스프레드시트에 붙여넣을 서버 코드 |
| `apps-script/CreateDialog.html` | 스프레드시트 메뉴의 등록부 만들기 창 (변경 없음) |
| `build.js` | `.env` 값을 `dist/config.js`로 만들고 `dist/` 생성 |
| `.github/workflows/deploy.yml` | main 푸시 시 자동 배포 |

`dist/`는 빌드 결과물이라 커밋하지 않습니다.

## 설치

### 1. Apps Script 배포

1. 기존 스프레드시트에서 **확장 프로그램 → Apps Script**를 엽니다.
2. `Code.gs` 내용을 `apps-script/Code.gs`로 전부 교체합니다.
3. `AdminApp.html`과 `SignApp.html` 파일은 삭제합니다. 이제 GitHub Pages가 화면을 제공합니다. `CreateDialog`는 스프레드시트 메뉴에서 계속 쓰므로 남겨 둡니다.
4. **배포 → 새 배포 → 웹 앱**을 선택하고 이렇게 맞춥니다.
   - 실행 계정: **나**
   - 액세스 권한: **모든 사용자**
5. 나온 `/exec` 주소를 복사해 둡니다.

주소가 브라우저에서 열리는지 먼저 확인하세요. `{"ok":true,"service":"연수 등록부 API",...}`가 보이면 정상입니다. 로그인 화면이 뜬다면 액세스 권한이 잘못된 것입니다.

코드를 고칠 때마다 **배포 관리 → 편집 → 버전: 새 버전**으로 다시 배포해야 `/exec` 주소에 반영됩니다. 주소는 그대로 유지됩니다.

### 2. GitHub 저장소

1. 이 폴더를 저장소로 올립니다.
2. **Settings → Secrets and variables → Actions**에서 시크릿을 추가합니다.
   - `APPS_SCRIPT_URL` : 1단계에서 복사한 `/exec` 주소
   - `SPREADSHEET_ID` : 선택 사항. 비워도 됩니다.
3. **Settings → Pages → Source**를 **GitHub Actions**로 바꿉니다. 브랜치 배포를 고르면 빌드가 실행되지 않아 `config.js`가 없는 화면이 올라갑니다.
4. main에 푸시하면 배포됩니다. 서명 화면은 `.../index.html`, 관리 화면은 `.../admin.html`입니다.

### 3. 로컬에서 확인

```bash
cp .env.example .env   # APPS_SCRIPT_URL 값 채우기
npm start              # 빌드 후 dist/ 를 로컬 서버로 띄움
```

VS Code의 Live Server로 `public/` 폴더를 직접 열면 `config.js`가 없어 동작하지 않습니다. `npm start`로 만들어진 `dist/`를 여세요. 파일을 고친 뒤에는 다시 실행해야 합니다.

## .env

```
APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycb.../exec
SPREADSHEET_ID=
REQUIRE_ADMIN_TOKEN=false
```

`.env`는 `.gitignore`에 있어 저장소에 올라가지 않습니다. 다만 **값 자체는 빌드된 `config.js`에 그대로 들어가고 브라우저에서 볼 수 있습니다.** 정적 페이지에서 `.env`는 값을 저장소 기록에서 빼두는 용도이지, 값을 숨겨주는 장치가 아닙니다. 진짜 비밀번호나 키는 여기 넣으면 안 됩니다.

## 알아두실 점

**관리 화면에 인증이 없습니다.** 기존 구조를 그대로 유지했습니다. 다만 전보다 위험해진 부분이 있습니다. 예전에는 Apps Script 주소를 아는 사람만 접근할 수 있었지만, 이제 `/exec` 주소가 공개 저장소의 `config.js`에 적혀 있습니다. 주소를 찾은 사람은 등록부 삭제와 명단 변경을 직접 호출할 수 있습니다.

나중에 막고 싶으면 코드 수정 없이 켤 수 있게 해뒀습니다.

1. Apps Script **프로젝트 설정 → 스크립트 속성**에 `ADMIN_TOKEN`과 원하는 암호를 추가
2. 저장소 변수(Variables)에 `REQUIRE_ADMIN_TOKEN=true` 추가 후 재배포

관리 화면에 들어갈 때 암호를 한 번 물어보고, 서명 화면은 암호 없이 그대로 동작합니다. 암호는 브라우저 세션에만 저장되고 `config.js`에는 들어가지 않습니다.

**저장소를 비공개로 두려면** GitHub Pages 사용에 유료 플랜이 필요합니다. 무료 플랜에서는 공개 저장소만 Pages를 쓸 수 있습니다.

**PDF 인쇄와 시트 열기 링크**는 구글 계정으로 스프레드시트 접근 권한이 있어야 열립니다. 관리자 본인은 문제없지만, 권한 없는 사람에게는 링크가 열리지 않습니다.

## 검증 범위

JavaScript 문법 검사를 통과했고, 모의 객체로 다음을 확인했습니다.

- 요청 라우팅: 인자 전달, 허용 목록 밖 함수 차단, 깨진 요청 처리, 토큰 검사
- 호출기: 응답 해석, 서버 오류의 예외 변환, 네트워크 실패, 로그인 페이지 응답 안내, 토큰 동봉
- 빌드: 주소 누락 시 중단, 환경변수 우선순위, `config.js` 생성

**검증하지 못한 것:** 실제 Apps Script 배포와 도메인 간 통신, GitHub Actions 실행, 실제 휴대폰 터치 서명, 시트 이미지 삽입. 서명 저장은 브라우저 → Apps Script → 시트 전 구간을 한 번 끝까지 돌려보고 사용하세요. 순서는 명단 저장 → 등록부 생성 → 휴대폰 서명 → 시트에서 이미지 확인 → PDF 인쇄입니다.

기존 구조에서 이어지는 제한(동명이인 이전 서명, 행 번호 기반 관리 등)은 [docs/업데이트-기록.md](docs/업데이트-기록.md)에 정리되어 있습니다.
