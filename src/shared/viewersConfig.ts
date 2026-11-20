// ────────────────────────────────────────────────────────────────────────
// 뷰어 수 배지 — 운영자 설정 (어드민 → custom-template-data → 팬 화면)
//
// 저장 위치: 플랫폼 내장 JSON 저장소 custom-template-data, displayKey = VIEWERS_CONFIG_KEY
//   어드민 화면(ariana-test-admin-templates-sandbox의 "실시간 뷰어 수" 설정)이 POST/PUT으로 저장하고,
//   팬 화면은 GET /home/v1/custom-template-data/{displayKey}(PUBLIC 키, 로그인 불필요)로 읽는다.
//   ※ 이 파일은 팬 화면 레포(ariana-test-custom-templates-sandbox, heidi 레포의 복사본 포함)와
//     어드민 레포(src/shared/viewersConfig.ts)가 같은 내용을 유지한다(레포가 분리돼 있어 복사본을 쓴다 — 고칠 때는 모두 같이 고친다).
//
// 원칙: 설정이 없거나(404) 읽기에 실패하거나 형식이 틀리면 "설정 없음" — 즉 어드민 기능 도입 전과 똑같이 동작한다.
// ────────────────────────────────────────────────────────────────────────

// key는 점(.)·콜론(:)이 없는 짧은 이름이어야 한다 — custom-template-data는 JSON 키·키 이름에 점이 있으면 저장 때 HTTP 500을 돌려준다.
export const VIEWERS_CONFIG_KEY = 'ariana-viewers'

// 팬 화면은 설정을 읽을 때 주소 끝에 1분마다 바뀌는 값을 붙여 게이트웨이 캐시를 피한다(저장 후 보통 1분 안에 반영).
export const CONFIG_CACHE_BUCKET_MS = 60_000

// 로컬(localhost)에서 어드민 없이 확인할 때 쓰는 브라우저 저장 키(어드민 레포 전용 — 팬 화면은 쓰지 않는다)
export const LOCAL_CONFIG_STORAGE_KEY = 'ariana-viewers-config-local'

/** 최소 인원 입력 상한. 너무 큰 값을 잘못 넣어 캡슐이 영영 안 보이는 실수를 막는다. */
export const MIN_WATCHING_LIMIT = 99

export interface ViewersConfig {
  version: 1
  /**
   * 지금 보는 사람이 이 수보다 적으면 캡슐을 숨긴다(썰렁해 보이는 것을 막으려고). 0이면 사람이 적어도 항상 보여 준다.
   * 보는 사람에는 나 자신도 들어가므로 3이면 나 말고 2명 이상일 때 보인다.
   */
  minWatching: number
}

export const DEFAULT_VIEWERS_CONFIG: ViewersConfig = { version: 1, minWatching: 0 }

/** 저장소 응답은 `{ displayKey, data, ... }` 모양이거나 data 자체일 수 있다. */
export function unwrapStoredData(body: unknown): unknown {
  return body && typeof body === 'object' && 'data' in body ? (body as { data?: unknown }).data : body
}

/** 0~MIN_WATCHING_LIMIT 사이의 정수로 맞춘다. 숫자가 아니면 null. */
export function clampMinWatching(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.min(MIN_WATCHING_LIMIT, Math.max(0, Math.floor(n)))
}

/** 저장된 값(객체 또는 JSON 문자열)을 설정으로 바꾼다. 모르는 필드는 버리고, 형식이 틀리면 null(= 설정 없음). */
export function parseViewersConfig(raw: unknown): ViewersConfig | null {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object') return null
  const minWatching = clampMinWatching((value as { minWatching?: unknown }).minWatching)
  return minWatching === null ? null : { version: 1, minWatching }
}
