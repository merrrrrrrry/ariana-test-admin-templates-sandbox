// ────────────────────────────────────────────────────────────────────────
// 스타 댓글 모아보기 — 운영자 설정 (어드민 → custom-template-data → 유저 화면)
//
// 저장 위치: 플랫폼 내장 JSON 저장소 custom-template-data, displayKey = CONFIG_KEY
//   어드민 화면(ariana-test-admin-templates-sandbox)이 POST/PUT으로 저장하고,
//   이 화면은 GET /home/v1/custom-template-data/{displayKey}(PUBLIC 키)로 읽는다.
//   ※ 이 파일은 어드민 레포의 src/shared/starCommentsConfig.ts 와 같은 내용을 유지한다
//     (두 레포가 분리돼 있어 복사본을 쓴다 — 고칠 때는 양쪽을 같이 고친다).
//
// 원칙: 설정이 없거나(404) 형식이 틀리면 DEFAULT_CONFIG — 즉 어드민 기능 도입 전과 똑같이 동작한다.
//       모르는 필드·잘못된 값은 버린다(양쪽에서 다시 검증).
// 반영 지연: 게이트웨이 조회 캐시 때문에 저장 후 최대 10분.
// ────────────────────────────────────────────────────────────────────────

export const CONFIG_KEY = 'merry-star-comments'
// 로컬(localhost)에서 어드민 없이 확인할 때 쓰는 브라우저 저장 키 — 설정 JSON을 여기에 넣으면 그대로 읽는다.
export const LOCAL_CONFIG_STORAGE_KEY = 'merry-star-comments-config-local'

// 위젯이 붙을 수 있는 자리. 값이 false인 자리의 위젯은 아무것도 그리지 않는다.
// 'page' = 독립 페이지(/star-story-comments)
export const PLACEMENTS = [
  { key: 'page', label: '독립 페이지 (/star-story-comments)' },
  { key: 'user.contents-home.contents-section:after', label: '콘텐츠 탭 · 섹션 묶음 아래' },
  { key: 'user.contents-home.contents-section:before', label: '콘텐츠 탭 · 섹션 묶음 위' },
  { key: 'user.contents-home.curation:after', label: '콘텐츠 탭 · 큐레이션 아래' },
  { key: 'user.community-board.feed:before', label: '커뮤니티 게시판 · 피드 위 (그 게시판 댓글만)' },
] as const

export type PlacementKey = (typeof PLACEMENTS)[number]['key']
export type SortKey = 'latest' | 'reactions'

export interface StarCommentsConfig {
  version: 1
  /** 전체 노출 스위치 */
  enabled: boolean
  /** 노출 기간(한국 시간 기준 날짜, YYYY-MM-DD). 비우면 제한 없음 */
  startDate: string | null
  endDate: string | null
  /** 자리별 노출 */
  placements: Record<PlacementKey, boolean>
  title: string
  subtitle: string
  emptyText: string
  linkLabels: { contents: string; story: string; community: string }
  /** 모을 출처 */
  sources: { contents: boolean; story: boolean; community: boolean }
  /** 제외할 커뮤니티 게시판(게시판 제목) */
  excludedBoards: string[]
  /** 스타 칩 순서(닉네임) — 앞에 둘 스타. 나머지는 뒤에 */
  starOrder: string[]
  /** 숨길 스타(닉네임) */
  hiddenStars: string[]
  /** 맨 위에 고정할 댓글: 댓글 내용에 이 글자가 들어 있으면 고정 */
  pinnedKeywords: string[]
  /** 숨길 댓글: 댓글 내용에 이 글자가 들어 있으면 숨김 */
  hiddenKeywords: string[]
  defaultSort: SortKey
  /** 한 번에 보여줄 개수 (6~30) */
  pageSize: number
}

export const DEFAULT_CONFIG: StarCommentsConfig = {
  version: 1,
  enabled: true,
  startDate: null,
  endDate: null,
  placements: {
    page: true,
    'user.contents-home.contents-section:after': true,
    'user.contents-home.contents-section:before': true,
    'user.contents-home.curation:after': true,
    'user.community-board.feed:before': true,
  },
  title: '스타의 댓글 모아보기',
  subtitle: '스타가 남긴 댓글을 한곳에서 확인해보세요',
  emptyText: '아직 스타 댓글이 없어요.',
  linkLabels: { contents: '콘텐츠 보러가기', story: '스타 스토리 보러가기', community: '커뮤니티 글 보러가기' },
  sources: { contents: true, story: true, community: true },
  excludedBoards: [],
  starOrder: [],
  hiddenStars: [],
  pinnedKeywords: [],
  hiddenKeywords: [],
  defaultSort: 'latest',
  pageSize: 12,
}

export const LIMITS = {
  title: 60,
  subtitle: 120,
  emptyText: 120,
  linkLabel: 30,
  listItems: 50,
  listItemLength: 40,
  pageSizeMin: 6,
  pageSizeMax: 30,
} as const

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function text(value: unknown, fallback: string, max: number): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim().slice(0, LIMITS.listItemLength)
    if (trimmed && !out.includes(trimmed)) out.push(trimmed)
    if (out.length >= LIMITS.listItems) break
  }
  return out
}

function date(value: unknown): string | null {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null
  return Number.isNaN(Date.parse(`${value}T00:00:00+09:00`)) ? null : value
}

/** 저장소에서 읽은 값을 검증해 설정으로 만든다. 모르는 필드·틀린 값은 버리고 기본값으로 채운다. */
export function parseConfig(raw: unknown): StarCommentsConfig {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return DEFAULT_CONFIG
    }
  }
  if (!value || typeof value !== 'object') return DEFAULT_CONFIG
  const r = value as Record<string, unknown>
  const d = DEFAULT_CONFIG
  const placementsRaw = (r.placements && typeof r.placements === 'object' ? r.placements : {}) as Record<string, unknown>
  const labelsRaw = (r.linkLabels && typeof r.linkLabels === 'object' ? r.linkLabels : {}) as Record<string, unknown>
  const sourcesRaw = (r.sources && typeof r.sources === 'object' ? r.sources : {}) as Record<string, unknown>
  const pageSizeRaw = typeof r.pageSize === 'number' && Number.isFinite(r.pageSize) ? Math.round(r.pageSize) : d.pageSize
  const placements = { ...d.placements }
  for (const { key } of PLACEMENTS) placements[key] = bool(placementsRaw[key], d.placements[key])
  return {
    version: 1,
    enabled: bool(r.enabled, d.enabled),
    startDate: date(r.startDate),
    endDate: date(r.endDate),
    placements,
    title: text(r.title, d.title, LIMITS.title),
    subtitle: typeof r.subtitle === 'string' ? r.subtitle.trim().slice(0, LIMITS.subtitle) : d.subtitle,
    emptyText: text(r.emptyText, d.emptyText, LIMITS.emptyText),
    linkLabels: {
      contents: text(labelsRaw.contents, d.linkLabels.contents, LIMITS.linkLabel),
      story: text(labelsRaw.story, d.linkLabels.story, LIMITS.linkLabel),
      community: text(labelsRaw.community, d.linkLabels.community, LIMITS.linkLabel),
    },
    sources: {
      contents: bool(sourcesRaw.contents, d.sources.contents),
      story: bool(sourcesRaw.story, d.sources.story),
      community: bool(sourcesRaw.community, d.sources.community),
    },
    excludedBoards: list(r.excludedBoards),
    starOrder: list(r.starOrder),
    hiddenStars: list(r.hiddenStars),
    pinnedKeywords: list(r.pinnedKeywords),
    hiddenKeywords: list(r.hiddenKeywords),
    defaultSort: r.defaultSort === 'reactions' ? 'reactions' : 'latest',
    pageSize: Math.min(LIMITS.pageSizeMax, Math.max(LIMITS.pageSizeMin, pageSizeRaw)),
  }
}

/** 지금 이 자리에서 보여줘야 하는지: 전체 스위치 · 자리별 스위치 · 노출 기간. */
export function isVisible(config: StarCommentsConfig, placement: string, now = Date.now()): boolean {
  if (!config.enabled) return false
  if (placement in config.placements && !config.placements[placement as PlacementKey]) return false
  if (config.startDate && now < Date.parse(`${config.startDate}T00:00:00+09:00`)) return false
  if (config.endDate && now > Date.parse(`${config.endDate}T23:59:59+09:00`)) return false
  return true
}

/** 응답이 { data: {...} } 모양이면 data를, 설정 객체 자체면 그대로 돌려준다. */
export function unwrapStoredData(body: unknown): unknown {
  return body && typeof body === 'object' && 'data' in body ? (body as { data?: unknown }).data : body
}
