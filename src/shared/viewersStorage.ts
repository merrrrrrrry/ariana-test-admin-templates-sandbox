import { client } from './client'
import {
  DEFAULT_VIEWERS_CONFIG,
  LOCAL_CONFIG_STORAGE_KEY,
  VIEWERS_CONFIG_KEY,
  parseViewersConfig,
  unwrapStoredData,
  type ViewersConfig,
} from './viewersConfig'

// ────────────────────────────────────────────────────────────────────────
// 실시간 뷰어 수 설정 저장소 (플랫폼 내장 JSON 저장소 custom-template-data)
//
//   GET  /home/v1/custom-template-data/{displayKey}   — 조회 (없으면 404)
//   POST /home/v1/custom-template-data                — 생성 { displayKey, data }
//   PUT  /home/v1/custom-template-data/{displayKey}   — 수정 { data }   (없는 키는 404 — upsert 아님)
//   (포털 API 레퍼런스 › 운영자 탭 › Gateway - 커스텀 템플릿 데이터. 스타 댓글 모아보기 설정이 이미 같은 경로를 쓴다.)
//
// 어드민 게이트웨이는 어드민 로그인 쿠키 + MANAGEMENT 키(bsm_)를 함께 확인한다. 로컬(localhost)에는 어드민 로그인이 없어
// 호출이 안 되므로, 로컬에서는 브라우저 저장(localStorage)으로 대신한다(팬 화면에는 닿지 않는다).
// ────────────────────────────────────────────────────────────────────────

export function isLocalPreview(): boolean {
  return typeof window !== 'undefined' && window.location.hostname === 'localhost'
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: number }).status === 404
}

export interface StoredViewersConfig {
  config: ViewersConfig
  /** 저장소에 이미 값이 있는지 — 있으면 PUT, 없으면 POST로 저장한다 */
  exists: boolean
}

export async function readViewersConfig(): Promise<StoredViewersConfig> {
  if (isLocalPreview()) {
    try {
      const local = window.localStorage.getItem(LOCAL_CONFIG_STORAGE_KEY)
      const parsed = local ? parseViewersConfig(local) : null
      return parsed ? { config: parsed, exists: true } : { config: DEFAULT_VIEWERS_CONFIG, exists: false }
    } catch {
      return { config: DEFAULT_VIEWERS_CONFIG, exists: false }
    }
  }
  try {
    const res = await client.get<unknown>('/home/v1/custom-template-data/{displayKey}', {
      path: { displayKey: VIEWERS_CONFIG_KEY },
    })
    const parsed = parseViewersConfig(unwrapStoredData(res.data))
    // 값이 있는데 형식이 틀리면(손으로 고친 경우 등) 저장된 게 없는 것처럼 보여 주되, 저장은 PUT으로 덮어쓴다.
    return { config: parsed ?? DEFAULT_VIEWERS_CONFIG, exists: true }
  } catch (err) {
    if (isNotFound(err)) return { config: DEFAULT_VIEWERS_CONFIG, exists: false }
    throw err
  }
}

/** 저장. 서버에 보내기 전에 한 번 더 검증·정리한다(모르는 필드는 버려진다). */
export async function writeViewersConfig(next: ViewersConfig): Promise<void> {
  const clean = parseViewersConfig(next)
  if (!clean) throw new Error('최소 인원은 0~99 사이의 숫자여야 해요')

  if (isLocalPreview()) {
    window.localStorage.setItem(LOCAL_CONFIG_STORAGE_KEY, JSON.stringify(clean))
    return
  }

  // 저장 직전에 있는지 다시 확인한다(처음 불러온 뒤 다른 운영자가 만들었을 수 있어서).
  const current = await readViewersConfig()
  if (current.exists) {
    await client.put('/home/v1/custom-template-data/{displayKey}', {
      path: { displayKey: VIEWERS_CONFIG_KEY },
      body: { data: clean },
    })
  } else {
    await client.post('/home/v1/custom-template-data', { body: { displayKey: VIEWERS_CONFIG_KEY, data: clean } })
  }
}
