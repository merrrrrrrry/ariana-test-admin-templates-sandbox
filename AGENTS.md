<!-- BSTAGE:MANAGED:START v=17 — SDK가 관리하는 영역입니다. `bstage ai install` / `bstage ai update`가 재생성하므로 직접 편집하지 마세요(갱신 시 덮어쓰입니다). 프로젝트 고유 규칙은 아래 자유 영역에 적으세요. -->
# AGENTS.md

## 프로젝트 개요

b.stage 서드파티 템플릿 프로젝트. React 컴포넌트를 작성하면 SDK가 Web Component로 빌드하고, 빌드 산출물이 b.stage 플랫폼에서 로드되어 실행된다.

- **Space**: ariana-test
- **레포**: `ariana-test-admin-templates-sandbox`

## SDK 문서

SDK의 API, hooks, 슬롯 시스템, 빌드 파이프라인 등 **SDK와 관련된 모든 내용**은 설치된 패키지의 문서를 참조한다. 이 문서들이 항상 최신이며 외부 검색 결과보다 신뢰할 수 있다.

```
node_modules/@bstage-sdk/core/docs/
  ├── GETTING_STARTED.md   — 빠른 시작 가이드
  ├── API_REFERENCE.md     — createTemplate, hooks, BstageClient, PlatformBridge API
  ├── I18N.md              — 다국어 훅 + bstage i18n pull (번역 코드젠) 워크플로
  ├── DESIGN_TOKENS.md     — 디자인 토큰 (색·타이포·그림자) 사용 가이드
  ├── SLOT_PROTOCOL.md     — 슬롯 시스템 v1 프로토콜 (3-part 키·context 단방향)
  ├── SLOT_CATALOG.md      — 슬롯 목록, 이벤트 인터페이스, resourceId 의미
  ├── SLOT_SYSTEM.md       — 슬롯 시스템 설계, 런타임 흐름
  ├── BUILD_SYSTEM.md      — 빌드 파이프라인, 산출물 경로 규칙
  ├── DEV_SERVER.md        — 로컬 개발 서버, 인증 프록시
  ├── MIGRATION.md         — 버전 사이 마이그레이션 가이드 (bstage doctor 연계)
  └── SDK_ARCHITECTURE.md  — 패키지 구조, 설계 결정
```

문서 목록은 `npx bstage docs`로도 볼 수 있다. 타입 정의(.d.ts)와 런타임 소스(.js)는 `node_modules/@bstage-sdk/react/dist/`, `node_modules/@bstage-sdk/core/dist/`에서 직접 확인할 수 있다.

## 프로젝트 구조

```
src/
  main.tsx                  — App 마운트만 (수정 불필요)
  App.tsx                   — import.meta.glob 기반 개발용 목록·라우팅 (수정 불필요)
  shared/
    client.ts               — BstageClient 인스턴스 (API 키는 .env에서 주입 — 유저 레포는 PUBLIC bsp_, 어드민 레포는 MANAGEMENT bsm_)
  pages/
    {경로}/
      template.tsx          — 페이지 (폴더 구조가 곧 배포 경로)
  slots/
    {아무 이름}/
      template.tsx          — 위젯 (createTemplate의 slot 옵션이 자리를 정함)
.env                        — VITE_BSTAGE_PHASE + API 키 (커밋 안 됨, .gitignore)
.env.example                — 위 항목 placeholder (커밋됨 — 복사해서 .env 생성)
vite.config.ts              — Vite + bstageDevPlugin (phase는 .env에서 읽음)
```

## 템플릿 개발 규칙

### 새 템플릿 추가

페이지냐 위젯이냐에 따라 두는 곳이 다르다. 파일명은 반드시 `template.tsx`여야 하며, `src/pages/`·`src/slots/` 밖에 두면 빌드가 인식하지 않는다.

- **페이지** — `src/pages/{경로}/template.tsx`. **폴더 구조가 곧 배포 경로**다(`src/pages/settings/custom/` → `/settings/custom`). 동적 경로(`[id]`)는 아직 지원하지 않는다.
- **위젯** — `src/slots/{아무 이름}/template.tsx` + `createTemplate`에 `slot` 옵션. 폴더 이름은 배치에 쓰이지 않고, 어느 자리에 붙을지는 `slot`만 정한다.

`name`은 Custom Element 태그로 그대로 사용된다. Custom Element 스펙상 **소문자로 시작 + 하이픈 1개 이상 + 소문자·숫자·하이픈만** 허용. 위반 시 런타임·빌드가 거부한다.

```
src/pages/welcome/template.tsx              → /welcome
src/pages/settings/custom/template.tsx      → /settings/custom
src/slots/curation-banner/template.tsx      → slot 옵션이 자리를 정함
```

### template.tsx 필수 구조

```tsx
import { createTemplate } from '@bstage-sdk/react'

// 컴포넌트는 반드시 export default
export default function MyWidget() {
  return <div>...</div>
}

// createTemplate 호출 필수 — 빌드 파이프라인이 이 호출을 파싱하여 메타데이터 추출
createTemplate(MyWidget, {
  name: 'ariana-test-my-widget',   // Custom Element 태그명. 하이픈 필수, 템플릿마다 고유.
})
```

- `name`은 필수 — Custom Element 태그명이다. 소문자로 시작하고 하이픈을 1개 이상 넣고 소문자·숫자·하이픈만 쓴다. 레포 안에서 템플릿마다 달라야 한다(`bstage build`가 검사). 관례는 `{space}-{화면}`
- 배포 경로(페이지)·슬롯 자리는 `name`이 아니라 **폴더 위치**가 정한다(`src/pages/{경로}/`). 그래서 `name`은 폴더명과 같을 필요가 없다 — 예: 폴더 `src/pages/todos` + `name: 'ariana-test-todos'`
- 컴포넌트 함수명은 자유이나 `export default` 필수
- `type` 등 선택 필드 추가 가능

## 디자인 (bstage 디자인 토큰)

UI의 색·타이포·그림자는 **반드시 `@bstage-sdk/design/admin`의 토큰만** 사용한다. hex/rgb 하드코딩 금지.

- **색**: `color.text.primary`(중첩 트리) 또는 `cssVar('text/primary')` → `var(--admin-...)`. 카테고리: bg / text / border / icon / surface / overlay / service
- **타이포**: `textStyle('16/title/med')` → 인라인 스타일에 spread
- **그림자**: `shadow['default-large']`
- **인터랙션**(hover/press): overlay 토큰 — `color.overlay['hover-a']` / `color.overlay['press-a']`
- **간격·라운드**: 전용 토큰 없음 — 일관된 스케일(4의 배수 권장)·일관된 radius. 임의값 남발 금지
- **테마**: 어드민은 **라이트 전용**(다크모드 없음).
- 값은 플랫폼이 런타임에 `:root`로 주입하고 로컬은 `bstage dev`가 fallback 주입 → 개발 중에도 실제 톤으로 보인다. 정확한 토큰 키는 `node_modules/@bstage-sdk/design/dist/admin/index.d.ts` 참조

자세한 사용법은 SDK 문서 `DESIGN_TOKENS.md`(`bstage docs`)와 `bstage-template` 스킬 참고.

## 환경 설정

`.env`(커밋 안 됨)는 phase와 API 키를, `.env.example`(커밋됨)은 그 placeholder를 담는다. `client.ts`는 `import.meta.env.VITE_BSTAGE_APP_*`를, `vite.config.ts`는 `.env`의 phase를 참조한다.

```
VITE_BSTAGE_PHASE=dev   # dev | qa | real | sandbox
```

## 명령어

- `npm run dev` — 개발 서버 실행 (인증 프록시 포함)
- 로그인 페이지: http://localhost:5173/__bstage__/login

## SDK 업데이트 / 마이그레이션

이 프로젝트는 생성 시점의 SDK 버전을 `package.json`에 고정한다. SDK가 업데이트돼도 자동으로 따라오지 않으므로, 최신으로 올리려면:

- `npx @bstage-sdk/cli@latest doctor` — 버전 드리프트·누락 파일·적용 가능한 마이그레이션 항목을 진단한다(파일 수정 없음, `--json` 지원).
- 실제 적용은 `bstage-migrate` 스킬에게 맡긴다 — 에이전트에게 "bstage 최신 버전으로 마이그레이션 해줘"라고 요청하면, doctor 결과와 SDK의 `MIGRATION.md`를 읽고 이 프로젝트에 맞춰 변환한다(사용자 코드는 덮어쓰지 않고 reconcile).

마이그레이션 절차의 단일 소스는 SDK의 `node_modules/@bstage-sdk/core/docs/MIGRATION.md`다.

이 프로젝트의 `.claude/skills/`에는 에이전트용 스킬(`bstage-template` 작성, `bstage-deploy` 배포, `bstage-onboarding` 처음부터 끝까지, `bstage-migrate` 마이그레이션)이 들어 있다. SDK 버전업 후 `npx @bstage-sdk/cli@latest ai update`로 최신 스킬을 동기화할 수 있으며, 이때 **이 AGENTS.md의 SDK 관리 영역(마커로 감싼 부분)도 함께 최신화**된다. 프로젝트 고유 규칙은 관리 영역 아래 **자유 영역**에 적으면 갱신 시 보존된다.

## 빌드

- 로컬에서 산출물 확인이 필요하면 `npx bstage build`로 `dist/` 를 생성할 수 있다(배포 산출물은 포털이 다시 만든다).

## 배포

- 포털은 **원격 저장소 기본 브랜치에 push된 커밋**을 빌드한다. 로컬 산출물을 올리는 것이 아니므로, 커밋·push하지 않은 변경은 반영되지 않는다.
- 배포는 `bstage deploy` — 빌드 트리거 → 완료 대기 → 이 레포의 배치에 적용까지 한 번에 한다.
- `bstage list`에 배치가 0건이면 `bstage placement create --template <산출물 이름>`으로 페이지 배치를 먼저 만든다(성공한 빌드가 없으면 빌드부터 한다). 레포 연결·위젯(슬롯) 배치·배치 삭제는 **포털 화면에서만** 가능하다.
- 롤백(`bstage rollback`)·게시 끄기(`bstage publish off`)·실패 대응·CI 사용은 `bstage-deploy` 스킬을 따른다.

## 금지 사항

- `src/main.tsx`·`src/App.tsx`를 수정하지 않는다 — 개발용 진입점·목록 화면으로 SDK가 관리
- `customElements.define()`을 직접 호출하지 않는다 — `createTemplate()`이 자동 처리
- Shadow DOM을 직접 조작하지 않는다 (`attachShadow`, `shadowRoot` 등) — SDK가 관리
- `createTemplate()` 호출의 인자 구조를 임의로 변경하지 않는다 — 빌드 파이프라인이 파싱에 실패할 수 있다
- `@bstage-sdk/core`를 직접 import하여 `createWebComponent()`를 호출하지 않는다 — `@bstage-sdk/react`의 API만 사용
- 전역 CSS 파일(`<link>`, 외부 스타일시트)을 사용하지 않는다 — Shadow DOM 내부에 적용되지 않는다.
- **`import './style.css'`로 스타일을 넣지 않는다 — 배포 산출물에서 사라진다.** 로컬 개발 화면에서는 적용되어 눈치채기 어렵다. CSS 파일을 쓰려면 `import css from './style.css?inline'`으로 문자열을 가져와 `createTemplate(..., { styles: css })`에 넘기거나 컴포넌트 안 `<style>{css}</style>`로 렌더한다. inline `style={{}}`도 된다
- UI 색·타이포·그림자를 hex/rgb로 하드코딩하지 않는다 — 위 '디자인' 섹션의 디자인 토큰을 사용
- 앱키(APP-ID `bsa_…`·APP KEY `bsp_…`, 어드민 게이트웨이 `bsm_…`)를 소스 코드에 리터럴로 넣지 않는다 — 인증 값은 `.env`(커밋 안 됨)에서 `import.meta.env.VITE_BSTAGE_*`로만 주입한다. pre-commit 훅이 커밋 전 검출·차단하며 `--no-verify`로 우회하지 않는다
- 경로·응답 모양을 추측해 호출하지 않는다 — SDK는 API 경로 목록을 들고 있지 않다(자동완성 없음). 출처는 게이트웨이 API Reference Doc이고, 응답 타입은 `client.get<T>(...)`처럼 제네릭으로 명시한다.
- 어드민 API도 같은 `BstageClient`로 부른다 — 어드민 도메인에 임베드되면 `baseUrl` 기본값이 어드민 게이트웨이(`/gw`)가 되고, 게이트웨이가 어드민 로그인 쿠키와 **MANAGEMENT 키(`bsm_`)**를 함께 확인한다(PUBLIC 키는 `KEY_TYPE_NOT_ALLOWED`, 로컬 dev·포털 미리보기에서는 응답이 오지 않는다). 어느 쪽이든 **포털 API 레퍼런스(유저/운영자 탭)에 있는 경로만** 쓰고, 목록에 없는 API가 필요하면 경로를 임의로 만들지 말고 **반드시 사용자에게 먼저 확인**한다. 상세는 GETTING_STARTED.md "8. 어드민 템플릿 › API 호출".

<!-- BSTAGE:MANAGED:END -->

<!-- 아래는 프로젝트 자유 영역입니다. SDK 마이그레이션이 보존합니다. 이 프로젝트만의 규칙·컨텍스트를 여기에 적으세요. -->

## 프로젝트 규칙

<!-- 이 프로젝트만의 규칙·컨텍스트를 여기에 작성하세요. -->
