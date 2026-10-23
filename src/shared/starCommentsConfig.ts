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
// 팬 화면은 설정을 읽을 때 주소 끝에 1분마다 바뀌는 값을 붙여 게이트웨이 캐시를 피한다.
// 어드민은 저장 뒤 APPLY_WAIT_MS 동안 "반영 중" 로딩을 보여 주고 끝나면 "반영 완료"로 바꾼다.
export const CONFIG_CACHE_BUCKET_MS = 60_000
export const APPLY_WAIT_MS = CONFIG_CACHE_BUCKET_MS + 10_000
// 로컬(localhost)에서 어드민 없이 확인할 때 쓰는 브라우저 저장 키 — 설정 JSON을 여기에 넣으면 그대로 읽는다.
export const LOCAL_CONFIG_STORAGE_KEY = 'merry-star-comments-config-local'

// 위젯이 붙을 수 있는 자리. 값이 false인 자리의 위젯은 아무것도 그리지 않는다.
// 'page' = 독립 페이지(/star-story-comments)
// 슬롯 id는 스테이지 전체에서 한 레포만 쓸 수 있다. 이 스테이지에서 다른 레포가 이미 쓰는 자리
// (contents-section:before · curation:after · community-board.feed:before 등)는 넣지 않았다.
// ※ key는 점(.)·콜론(:)이 없는 짧은 이름이어야 한다 — custom-template-data는 JSON 키에 점이 있으면
//   저장 때 HTTP 500을 돌려준다(2026-10-22 실측). 슬롯 id를 그대로 키로 쓰면 안 된다.
export const PLACEMENTS = [
  { key: 'page', label: '독립 페이지 (/star-story-comments)' },
  { key: 'contents-after', label: '콘텐츠 탭 · 섹션 묶음 아래' },
  { key: 'curation-list', label: '콘텐츠 큐레이션 목록 페이지 · 위' },
  { key: 'section-list', label: '콘텐츠 섹션 목록(전체보기) 페이지 · 위' },
  { key: 'contents-detail-after', label: '콘텐츠 상세 페이지 · 본문 아래' },
  { key: 'contents-detail-comments', label: '콘텐츠 상세 페이지 · 댓글 영역 위' },
  { key: 'lounge-story', label: '라운지 스토리 탭 · 피드 위 (그 라운지의 스토리만)' },
  { key: 'lounge-contents', label: '라운지 콘텐츠 탭 · 섹션 위' },
  { key: 'lounge-community', label: '라운지 커뮤니티 탭 · 게시판 위' },
] as const

export type PlacementKey = (typeof PLACEMENTS)[number]['key']
export type SortKey = 'latest' | 'reactions'
export type PerPostOrder = 'latest' | 'reactions'

// 누구에게 보여줄지. membership·pop은 가입/구독 여부를 알려 주는 유저 API가 아직 없어서(허브 VOC #85, C등급)
// 지금은 고를 수 없다 — 어드민에 자리만 두고 available:false로 막아 둔다. API가 열리면 available을 true로 바꾸고
// 유저 화면(StarCommentsFeed의 isAudienceAllowed)에 판정을 붙인다.
export const AUDIENCES = [
  { key: 'all', label: '전체 공개', available: true },
  { key: 'login', label: '로그인한 팬만', available: true },
  { key: 'membership', label: '멤버십 가입자만', available: false },
  { key: 'pop', label: 'POP 구독자만', available: false },
] as const

export type AudienceKey = (typeof AUDIENCES)[number]['key']

export interface StarCommentsConfig {
  version: 1
  /** 전체 노출 스위치 */
  enabled: boolean
  /** 마지막으로 저장한 사람(이름)과 시각(ISO). 어드민이 저장할 때 채우고 어드민 화면에만 보인다 — 팬 화면은 쓰지 않는다 */
  updatedBy: string | null
  updatedAt: string | null
  /** 팬 화면 제목 옆의 켜기/끄기 스위치를 보여줄지. 숨기면 방문자가 예전에 꺼 둔 상태도 무시하고 항상 보여 준다 */
  showToggle: boolean
  /** 노출 기간(한국 시간 기준 날짜, YYYY-MM-DD). 비우면 제한 없음 */
  startDate: string | null
  endDate: string | null
  /** 누구에게 보여줄지 (지금은 all · login만 동작) */
  audience: AudienceKey
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
  /** 맨 위에 고정할 댓글 ID(팬 화면 주소 끝에 ?curate=1 을 붙이면 카드마다 "ID 복사" 버튼이 보인다). 적은 순서대로 위에 놓인다 */
  pinnedCommentIds: string[]
  /** 숨길 댓글(금칙어): 댓글 내용에 이 글자가 들어 있으면 숨김 */
  hiddenKeywords: string[]
  /** 태그 필터: 켜면 이 태그가 붙은 콘텐츠·스토리 글의 스타 댓글만 모은다(커뮤니티 글에는 태그가 없어 빠진다) */
  tagFilter: { enabled: boolean; tags: string[] }
  /** 글 하나당 보여줄 스타 댓글 수(0 = 제한 없음)와 고르는 기준 */
  perPostLimit: number
  perPostOrder: PerPostOrder
  /** 이 반응 수 이상인 댓글만(0 = 제한 없음). 스타 답글은 반응 수를 몰라 0으로 본다 */
  minReactions: number
  /** 숨길 댓글 ID — 태그 글 안에서 한두 개만 빼고 싶을 때 */
  hiddenCommentIds: string[]
  defaultSort: SortKey
  /** 한 번에 보여줄 개수 (6~30) */
  pageSize: number
}

export const DEFAULT_CONFIG: StarCommentsConfig = {
  version: 1,
  enabled: true,
  updatedBy: null,
  updatedAt: null,
  showToggle: true,
  startDate: null,
  endDate: null,
  audience: 'all',
  // 기존에 이미 보이던 두 자리만 켜 둔다. 새로 만든 자리는 꺼진 채로 시작해서, 포털에 위젯을 게시해도
  // 어드민에서 체크하기 전에는 팬 화면이 달라지지 않는다.
  placements: {
    page: true,
    'contents-after': true,
    'curation-list': false,
    'section-list': false,
    'contents-detail-after': false,
    'contents-detail-comments': false,
    'lounge-story': false,
    'lounge-contents': false,
    'lounge-community': false,
  },
  title: '스타의 댓글 모아보기',
  subtitle: '스타가 남긴 댓글을 한곳에서 확인해보세요',
  emptyText: '아직 스타 댓글이 없어요.',
  linkLabels: { contents: '콘텐츠 보러가기', story: '스타 스토리 보러가기', community: '커뮤니티 글 보러가기' },
  sources: { contents: true, story: true, community: true },
  excludedBoards: [],
  starOrder: [],
  hiddenStars: [],
  pinnedCommentIds: [],
  hiddenKeywords: [],
  tagFilter: { enabled: false, tags: [] },
  perPostLimit: 0,
  perPostOrder: 'latest',
  minReactions: 0,
  hiddenCommentIds: [],
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
  perPostLimitMax: 10,
  minReactionsMax: 9999,
  commentIdLength: 64,
  editorName: 30,
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

function list(value: unknown, maxLength: number = LIMITS.listItemLength): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim().slice(0, maxLength)
    if (trimmed && !out.includes(trimmed)) out.push(trimmed)
    if (out.length >= LIMITS.listItems) break
  }
  return out
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
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
  const tagRaw = (r.tagFilter && typeof r.tagFilter === 'object' ? r.tagFilter : {}) as Record<string, unknown>
  const pageSizeRaw = typeof r.pageSize === 'number' && Number.isFinite(r.pageSize) ? Math.round(r.pageSize) : d.pageSize
  const placements = { ...d.placements }
  for (const { key } of PLACEMENTS) placements[key] = bool(placementsRaw[key], d.placements[key])
  return {
    version: 1,
    enabled: bool(r.enabled, d.enabled),
    updatedBy: typeof r.updatedBy === 'string' && r.updatedBy.trim() ? r.updatedBy.trim().slice(0, LIMITS.editorName) : null,
    updatedAt: typeof r.updatedAt === 'string' && !Number.isNaN(Date.parse(r.updatedAt)) ? new Date(r.updatedAt).toISOString() : null,
    showToggle: bool(r.showToggle, d.showToggle),
    startDate: date(r.startDate),
    endDate: date(r.endDate),
    // 아직 쓸 수 없는 대상(membership · pop)이나 모르는 값은 전체 공개로 본다.
    audience: AUDIENCES.find((a) => a.key === r.audience && a.available)?.key ?? d.audience,
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
    pinnedCommentIds: list(r.pinnedCommentIds, LIMITS.commentIdLength),
    hiddenKeywords: list(r.hiddenKeywords),
    // 태그 필터를 켰는데 태그가 하나도 없으면 아무것도 안 나오는 실수를 막기 위해 꺼진 것으로 본다.
    tagFilter: (() => {
      const tags = list(tagRaw.tags)
      return { enabled: bool(tagRaw.enabled, false) && tags.length > 0, tags }
    })(),
    perPostLimit: int(r.perPostLimit, d.perPostLimit, 0, LIMITS.perPostLimitMax),
    perPostOrder: r.perPostOrder === 'reactions' ? 'reactions' : 'latest',
    minReactions: int(r.minReactions, d.minReactions, 0, LIMITS.minReactionsMax),
    hiddenCommentIds: list(r.hiddenCommentIds, LIMITS.commentIdLength),
    defaultSort: r.defaultSort === 'reactions' ? 'reactions' : 'latest',
    pageSize: Math.min(LIMITS.pageSizeMax, Math.max(LIMITS.pageSizeMin, pageSizeRaw)),
  }
}

/** 지금 이 자리에서 보여줘야 하는지: 전체 스위치 · 자리별 스위치 · 노출 기간. */
export function isVisible(config: StarCommentsConfig, placement: PlacementKey, now = Date.now()): boolean {
  if (!config.enabled) return false
  if (!config.placements[placement]) return false
  if (config.startDate && now < Date.parse(`${config.startDate}T00:00:00+09:00`)) return false
  if (config.endDate && now > Date.parse(`${config.endDate}T23:59:59+09:00`)) return false
  return true
}

/** 응답이 { data: {...} } 모양이면 data를, 설정 객체 자체면 그대로 돌려준다. */
export function unwrapStoredData(body: unknown): unknown {
  return body && typeof body === 'object' && 'data' in body ? (body as { data?: unknown }).data : body
}
