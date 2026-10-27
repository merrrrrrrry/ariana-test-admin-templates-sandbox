import { client } from './client'
import { unwrapStoredData, type PlacementKey } from './starCommentsConfig'
import { isLocalPreview } from './storage'

// ────────────────────────────────────────────────────────────────────────
// 이 스테이지에 어떤 화면이 있는지 확인해서, 없는 화면의 "어디에 보여줄까요" 자리를 어드민 목록에서 숨긴다.
//   - 라운지 자리: 스테이지에 라운지가 있을 때만
//   - 콘텐츠 큐레이션 목록 자리: 큐레이션 섹션에 콘텐츠가 있을 때만
// 값이 true / false면 확실한 결과, null이면 알 수 없음(호출이 막혔거나 응답 모양이 달라서) — 알 수 없을 땐 숨기지 않는다.
// ────────────────────────────────────────────────────────────────────────

export interface StageEnvironment {
  lounge: boolean | null
  curation: boolean | null
}

export const UNKNOWN_ENVIRONMENT: StageEnvironment = { lounge: null, curation: null }

const NEEDS: Partial<Record<PlacementKey, keyof StageEnvironment>> = {
  'curation-list': 'curation',
  'lounge-story': 'lounge',
  'lounge-contents': 'lounge',
  'lounge-community': 'lounge',
}

/** 이 스테이지에서 어드민 목록에 보여줄 자리인가 (확실히 없다고 확인된 화면의 자리만 숨긴다) */
export function placementVisible(key: PlacementKey, env: StageEnvironment): boolean {
  const need = NEEDS[key]
  return !need || env[need] !== false
}

type Fetched = { ok: true; data: unknown } | { ok: false; status?: number }

async function get(path: string): Promise<Fetched> {
  try {
    const res = await client.get<unknown>(path)
    return { ok: true, data: unwrapStoredData(res.data) }
  } catch (err) {
    const status = typeof err === 'object' && err !== null ? (err as { status?: number }).status : undefined
    return { ok: false, status }
  }
}

function asList(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body
  if (body && typeof body === 'object') {
    for (const v of Object.values(body as Record<string, unknown>)) if (Array.isArray(v)) return v
  }
  return null
}

async function detectLounge(): Promise<boolean | null> {
  const list = await get('/home/v1/lounges')
  if (list.ok) {
    const items = asList(list.data)
    if (items) return items.length > 0
  }
  // 목록을 못 읽으면 라운지 홈 페이지가 아예 없는지(404)만 본다. 있다고 나와도 라운지가 있다는 뜻은 아니라서 알 수 없음으로 둔다.
  const page = await get('/home/v1/pages/lounge-index')
  return !page.ok && page.status === 404 ? false : null
}

function hasCuration(section: unknown): boolean {
  if (!section || typeof section !== 'object') return false
  const s = section as { exposed?: unknown; contentIds?: unknown; contents?: unknown }
  const count = (v: unknown) => (Array.isArray(v) ? v.length : 0)
  return s.exposed !== false && (count(s.contentIds) > 0 || count(s.contents) > 0)
}

async function detectCuration(): Promise<boolean | null> {
  const home = await get('/home/v1/home/content')
  if (home.ok && home.data && typeof home.data === 'object') {
    return hasCuration((home.data as { curationSection?: unknown }).curationSection)
  }
  const section = await get('/home/v1/content-home/sections/curation')
  return section.ok ? hasCuration(section.data) : null
}

let cached: Promise<StageEnvironment> | null = null

/** 한 번만 확인해서 기억해 둔다. 로컬 미리보기에는 어드민 호출이 없어서 항상 "알 수 없음"이다. */
export function detectStageEnvironment(): Promise<StageEnvironment> {
  if (isLocalPreview()) return Promise.resolve(UNKNOWN_ENVIRONMENT)
  cached ??= Promise.all([detectLounge(), detectCuration()]).then(([lounge, curation]) => ({ lounge, curation }))
  return cached
}
