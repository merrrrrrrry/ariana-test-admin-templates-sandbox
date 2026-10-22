import { client } from './client'
import {
  CONFIG_KEY,
  DEFAULT_CONFIG,
  LOCAL_CONFIG_STORAGE_KEY,
  parseConfig,
  unwrapStoredData,
  type StarCommentsConfig,
} from './starCommentsConfig'

// ────────────────────────────────────────────────────────────────────────
// 스타 댓글 모아보기 설정 저장소 (플랫폼 내장 JSON 저장소 custom-template-data)
//
//   GET  /home/v1/custom-template-data/{displayKey}   — 조회 (없으면 404)
//   POST /home/v1/custom-template-data                — 생성 { displayKey, data }
//   PUT  /home/v1/custom-template-data/{displayKey}   — 수정 { data }   (없는 키는 404 — upsert 아님)
//   (포털 API 레퍼런스 › 운영자 탭 › Gateway - 커스텀 템플릿 데이터)
//
// 어드민 게이트웨이는 어드민 로그인 쿠키 + MANAGEMENT 키(bsm_)를 함께 확인한다. 로컬(localhost)에는
// 어드민 로그인이 없어 호출이 안 되므로, 로컬에서는 브라우저 저장(localStorage)으로 대신한다.
// 제약: 1MB · JSON 깊이 10 · <script> 등 XSS 패턴 거부 · 스테이지당 1,000건. 저장 후 유저 화면 반영은 최대 10분.
// ────────────────────────────────────────────────────────────────────────

export function isLocalPreview(): boolean {
  return typeof window !== 'undefined' && window.location.hostname === 'localhost'
}

export interface StoredConfig {
  config: StarCommentsConfig
  /** 저장소에 이미 값이 있는지 — 있으면 PUT, 없으면 POST로 저장한다 */
  exists: boolean
}

// custom-template-data는 JSON 키에 점(.)·$가 있으면 HTTP 500을 돌려준다(2026-10-22 실측).
// 저장 직전에 걸러서, 같은 실수가 다시 생기면 500 대신 어느 키가 문제인지 알려 준다.
function assertSafeKeys(value: unknown, path = ''): void {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/[.$]/.test(key)) throw new Error(`설정 키 "${path}${key}"에 점(.) 또는 $가 있어 저장할 수 없어요 (개발 오류)`)
    assertSafeKeys(child, `${path}${key}.`)
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: number }).status === 404
}

export async function readStoredConfig(): Promise<StoredConfig> {
  if (isLocalPreview()) {
    try {
      const local = window.localStorage.getItem(LOCAL_CONFIG_STORAGE_KEY)
      return local ? { config: parseConfig(local), exists: true } : { config: DEFAULT_CONFIG, exists: false }
    } catch {
      return { config: DEFAULT_CONFIG, exists: false }
    }
  }
  try {
    const res = await client.get<unknown>('/home/v1/custom-template-data/{displayKey}', {
      path: { displayKey: CONFIG_KEY },
    })
    return { config: parseConfig(unwrapStoredData(res.data)), exists: true }
  } catch (err) {
    if (isNotFound(err)) return { config: DEFAULT_CONFIG, exists: false }
    throw err
  }
}

/** 저장. 저장 직전에 한 번 더 읽어 처음 불러온 값과 다르면(다른 운영자가 먼저 바꿈) false를 돌려준다 — force면 그대로 덮어쓴다. */
export async function writeStoredConfig(
  next: StarCommentsConfig,
  loaded: StarCommentsConfig,
  force = false
): Promise<{ saved: boolean; conflict: boolean }> {
  // 서버에 보내기 전에 한 번 더 검증·정리한다(모르는 필드는 버려진다).
  const clean = parseConfig(next)
  assertSafeKeys(clean)

  if (isLocalPreview()) {
    window.localStorage.setItem(LOCAL_CONFIG_STORAGE_KEY, JSON.stringify(clean))
    return { saved: true, conflict: false }
  }

  const current = await readStoredConfig()
  if (!force && current.exists && JSON.stringify(current.config) !== JSON.stringify(loaded)) {
    return { saved: false, conflict: true }
  }
  if (current.exists) {
    await client.put('/home/v1/custom-template-data/{displayKey}', {
      path: { displayKey: CONFIG_KEY },
      body: { data: clean },
    })
  } else {
    await client.post('/home/v1/custom-template-data', { body: { displayKey: CONFIG_KEY, data: clean } })
  }
  return { saved: true, conflict: false }
}
