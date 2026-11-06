// ────────────────────────────────────────────────────────────────────────
// 스타 일정 페이지 — 공통 모듈 (유저 레포와 어드민 레포가 **동일한 사본**을 쓴다. 어드민 쪽을 고친 뒤 복사한다)
// 데이터 모델, 검증, KST 날짜 계산, 월 격자와 막대 배치, .ics / Google 캘린더 링크, 날짜 표기.
// 외부 import 없이 순수 함수로만 둔다(Node 테스트가 그대로 읽는다). 기획서: star-schedule/spec.md
// ────────────────────────────────────────────────────────────────────────

export const INDEX_KEY = 'star-schedule-index'
export const PAGE_KEY_PREFIX = 'star-schedule-'
export const LOCAL_INDEX_STORAGE_KEY = 'star-schedule-index-local'
export const LOCAL_PAGE_STORAGE_PREFIX = 'star-schedule-local-'
export const CACHE_BUCKET_MS = 60_000

export const LIMITS = {
  name: 40,
  star: 30,
  slug: 30,
  title: 100,
  description: 500,
  link: 300,
  labelName: 20,
  labels: 12,
  events: 2000,
  pages: 200,
  editorName: 30,
} as const

/** 라벨 색 팔레트(고정 7색) — 레퍼런스(T1 스테이지)의 라벨 색. UI 색이 아니라 운영자가 고르는 데이터 값이다. */
export const LABEL_COLORS = ['#EEB1B1', '#E8A4D7', '#C4C7D7', '#FFD692', '#BAE3AB', '#92B4E5', '#A0DEEF'] as const

export type Visibility = 'public' | 'login'

export interface ScheduleLabel {
  id: string
  name: string
  color: string
}

export interface ScheduleEvent {
  id: string
  title: string
  allDay: boolean
  /** UTC ISO. 종일 일정은 KST 기준 날짜만 의미가 있다 */
  startAt: string
  /** UTC ISO 또는 null. 여러 날 일정이면 시작과 다른 날 */
  endAt: string | null
  labelId: string | null
  link: string | null
  description: string | null
}

export interface SchedulePage {
  version: 1
  slug: string
  name: string
  star: string
  /** public = 누구나, login = 로그인한 팬에게만(화면에서 가림) */
  visibility: Visibility
  labels: ScheduleLabel[]
  events: ScheduleEvent[]
  updatedBy: string | null
  updatedAt: string | null
}

export interface ScheduleIndexEntry {
  slug: string
  name: string
  star: string
  visibility: Visibility
  eventCount: number
  updatedAt: string | null
}

export interface ScheduleIndex {
  version: 1
  pages: ScheduleIndexEntry[]
}

export const EMPTY_INDEX: ScheduleIndex = { version: 1, pages: [] }

// ── 검증 ────────────────────────────────────────────────────────────────

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/

export function isValidSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length <= LIMITS.slug && SLUG_PATTERN.test(value)
}

export const scheduleKey = (slug: string) => `${PAGE_KEY_PREFIX}${slug}`

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function optText(value: unknown, max: number): string | null {
  const t = text(value, max)
  return t === '' ? null : t
}

function iso(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

function httpLink(value: unknown): string | null {
  const t = text(value, LIMITS.link)
  return /^https?:\/\/\S+$/i.test(t) ? t : null
}

/** 저장소 응답이 `{ data: … }`로 한 번 감싸여 올 수 있어 벗긴다 */
export function unwrapData(body: unknown): unknown {
  return body && typeof body === 'object' && 'data' in body ? (body as { data?: unknown }).data : body
}

function asObject(raw: unknown): Record<string, unknown> {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function parseLabel(raw: unknown): ScheduleLabel | null {
  const r = asObject(raw)
  const id = text(r.id, 40)
  const name = text(r.name, LIMITS.labelName)
  if (!id || !name) return null
  const color = (LABEL_COLORS as readonly string[]).includes(String(r.color).toUpperCase()) ? String(r.color).toUpperCase() : LABEL_COLORS[0]
  return { id, name, color }
}

export function parseEvent(raw: unknown, labelIds: Set<string>): ScheduleEvent | null {
  const r = asObject(raw)
  const id = text(r.id, 40)
  const title = text(r.title, LIMITS.title)
  const startAt = iso(r.startAt)
  if (!id || !title || !startAt) return null
  let endAt = iso(r.endAt)
  if (endAt !== null && Date.parse(endAt) < Date.parse(startAt)) endAt = null
  const labelId = typeof r.labelId === 'string' && labelIds.has(r.labelId) ? r.labelId : null
  return {
    id,
    title,
    allDay: r.allDay === true,
    startAt,
    endAt,
    labelId,
    link: httpLink(r.link),
    description: optText(r.description, LIMITS.description),
  }
}

export function compareEvents(a: ScheduleEvent, b: ScheduleEvent): number {
  return Date.parse(a.startAt) - Date.parse(b.startAt) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
}

/** 저장된 값(문자열·객체·`{data}`로 감싼 값)을 안전한 일정 페이지로 바꾼다. 못 읽으면 null */
export function parseSchedulePage(raw: unknown): SchedulePage | null {
  const r = asObject(unwrapData(raw))
  if (!isValidSlug(r.slug)) return null
  const labels: ScheduleLabel[] = []
  const seen = new Set<string>()
  for (const item of Array.isArray(r.labels) ? r.labels : []) {
    const label = parseLabel(item)
    if (label && !seen.has(label.id) && labels.length < LIMITS.labels) {
      seen.add(label.id)
      labels.push(label)
    }
  }
  const events: ScheduleEvent[] = []
  const ids = new Set<string>()
  for (const item of Array.isArray(r.events) ? r.events : []) {
    const event = parseEvent(item, seen)
    if (event && !ids.has(event.id) && events.length < LIMITS.events) {
      ids.add(event.id)
      events.push(event)
    }
  }
  events.sort(compareEvents)
  return {
    version: 1,
    slug: r.slug,
    name: text(r.name, LIMITS.name) || r.slug,
    star: text(r.star, LIMITS.star),
    visibility: r.visibility === 'login' ? 'login' : 'public',
    labels,
    events,
    updatedBy: optText(r.updatedBy, LIMITS.editorName),
    updatedAt: iso(r.updatedAt),
  }
}

export function parseIndex(raw: unknown): ScheduleIndex {
  const r = asObject(unwrapData(raw))
  const pages: ScheduleIndexEntry[] = []
  const seen = new Set<string>()
  for (const item of Array.isArray(r.pages) ? r.pages : []) {
    const e = asObject(item)
    if (!isValidSlug(e.slug) || seen.has(e.slug) || pages.length >= LIMITS.pages) continue
    seen.add(e.slug)
    pages.push({
      slug: e.slug,
      name: text(e.name, LIMITS.name) || e.slug,
      star: text(e.star, LIMITS.star),
      visibility: e.visibility === 'login' ? 'login' : 'public',
      eventCount: typeof e.eventCount === 'number' && e.eventCount >= 0 ? Math.floor(e.eventCount) : 0,
      updatedAt: iso(e.updatedAt),
    })
  }
  return { version: 1, pages }
}

/** 저장소가 레코드 삭제를 지원하지 않을 때 덮어쓰는 "삭제 표시". 팬 화면은 이 레코드를 없는 페이지로 본다 */
export function makeTombstone(slug: string): { version: 1; slug: string; deleted: true } {
  return { version: 1, slug, deleted: true }
}

export function isTombstone(raw: unknown): boolean {
  return asObject(unwrapData(raw)).deleted === true
}

export function indexEntryOf(page: SchedulePage): ScheduleIndexEntry {
  return {
    slug: page.slug,
    name: page.name,
    star: page.star,
    visibility: page.visibility,
    eventCount: page.events.length,
    updatedAt: page.updatedAt,
  }
}

export function emptyPage(slug: string, name: string, star: string): SchedulePage {
  return { version: 1, slug, name, star, visibility: 'public', labels: [], events: [], updatedBy: null, updatedAt: null }
}

/** 저장소 키에 `.`/`$`가 있으면 500이 나므로, 저장 직전에 데이터 안의 모든 키를 검사한다 */
export function assertSafeKeys(value: unknown, path = ''): void {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/[.$]/.test(key)) throw new Error(`저장할 수 없는 키 "${path}${key}" (점 또는 $)`)
    assertSafeKeys(child, `${path}${key}.`)
  }
}

export function makeId(prefix: string): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '').slice(0, 10) : Math.random().toString(36).slice(2, 12)
  return `${prefix}_${rnd}`
}

// ── 날짜 (한국 시간 고정) ───────────────────────────────────────────────

const KST_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface Ymd {
  y: number
  m: number
  d: number
}

/** UTC ISO → 한국 시간의 날짜·시각 */
export function toKst(isoValue: string): { y: number; m: number; d: number; h: number; mi: number; dow: number } {
  const t = new Date(Date.parse(isoValue) + KST_MS)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), dow: t.getUTCDay() }
}

/** 한국 시간의 날짜·시각 → UTC ISO */
export function fromKst(y: number, m: number, d: number, h = 0, mi = 0): string {
  return new Date(Date.UTC(y, m - 1, d, h, mi) - KST_MS).toISOString()
}

export const dayKey = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const dayNumber = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS)

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** 일정이 걸친 첫날과 마지막 날(KST, 마지막 날 포함). 시간 있는 일정은 종료 시각이 정확히 자정이면 그 날을 포함하지 않는다 */
export function eventDayRange(ev: ScheduleEvent): { start: number; end: number } {
  const s = toKst(ev.startAt)
  const start = dayNumber(s.y, s.m, s.d)
  if (!ev.endAt) return { start, end: start }
  const endMs = Date.parse(ev.endAt) - (ev.allDay ? 0 : 1)
  const e = toKst(new Date(Math.max(endMs, Date.parse(ev.startAt))).toISOString())
  return { start, end: Math.max(start, dayNumber(e.y, e.m, e.d)) }
}

// ── 월 격자와 막대 배치 ─────────────────────────────────────────────────

export interface GridCell {
  /** 이 달의 날짜(1~31). 달 밖 칸은 null */
  day: number | null
  /** dayNumber(일 수). 달 밖 칸도 값을 가진다 */
  num: number
  key: string | null
  dow: number
}

export interface Segment {
  event: ScheduleEvent
  /** 주 안의 시작·끝 열(0~6, 끝 포함) */
  startCol: number
  endCol: number
  continuesLeft: boolean
  continuesRight: boolean
  /** 쌓이는 줄(0부터) */
  level: number
}

export interface GridWeek {
  cells: GridCell[]
  segments: Segment[]
  levels: number
}

export interface MonthLayout {
  weeks: GridWeek[]
  /** 모든 주에서 가장 많이 쌓인 줄 수 */
  maxLevels: number
}

/** 일요일 시작, 달 밖 칸은 비움(레퍼런스와 같음). 주 수는 달에 따라 4~6 */
export function monthWeeks(y: number, m: number): GridCell[][] {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const total = daysInMonth(y, m)
  const weekCount = Math.ceil((first + total) / 7)
  const weeks: GridCell[][] = []
  for (let w = 0; w < weekCount; w++) {
    const row: GridCell[] = []
    for (let c = 0; c < 7; c++) {
      const day = w * 7 + c - first + 1
      const inMonth = day >= 1 && day <= total
      const num = dayNumber(y, m, 1) + (w * 7 + c - first)
      row.push({ day: inMonth ? day : null, num, key: inMonth ? dayKey(y, m, day) : null, dow: c })
    }
    weeks.push(row)
  }
  return weeks
}

/**
 * 주마다 일정을 막대로 배치한다. 오래 걸친 일정을 먼저, 같으면 시작 시각 → 제목 순.
 * 겹치지 않는 가장 위 줄에 넣는다(first-fit). 주 경계에서 끊기고 다음 주에서 이어진다.
 */
export function layoutMonth(y: number, m: number, events: ScheduleEvent[]): MonthLayout {
  const weeks: GridWeek[] = []
  let maxLevels = 0
  const ranges = events.map((event) => ({ event, ...eventDayRange(event) }))
  const monthStart = dayNumber(y, m, 1)
  const monthEnd = dayNumber(y, m, daysInMonth(y, m))
  for (const cells of monthWeeks(y, m)) {
    const w0 = cells[0].num
    const w6 = cells[6].num
    // 달 밖 칸은 비워 두므로 막대는 이 달의 칸으로 자른다(레퍼런스와 같음)
    const visStart = Math.max(w0, monthStart)
    const visEnd = Math.min(w6, monthEnd)
    const inWeek = ranges
      .filter((r) => r.end >= visStart && r.start <= visEnd)
      .sort((a, b) => b.end - b.start - (a.end - a.start) || compareEvents(a.event, b.event))
    const occupied: boolean[][] = []
    const segments: Segment[] = []
    for (const r of inWeek) {
      const startCol = Math.max(r.start, visStart) - w0
      const endCol = Math.min(r.end, visEnd) - w0
      let level = 0
      while (occupied[level] && occupied[level].slice(startCol, endCol + 1).some(Boolean)) level++
      occupied[level] ??= Array(7).fill(false)
      for (let c = startCol; c <= endCol; c++) occupied[level][c] = true
      segments.push({ event: r.event, startCol, endCol, continuesLeft: r.start < visStart, continuesRight: r.end > visEnd, level })
    }
    segments.sort((a, b) => a.level - b.level || a.startCol - b.startCol)
    weeks.push({ cells, segments, levels: occupied.length })
    maxLevels = Math.max(maxLevels, occupied.length)
  }
  return { weeks, maxLevels }
}

/** 목록 보기: 날짜(키) → 그 날의 일정. 여러 날 일정은 걸친 날마다 나온다(레퍼런스와 같음) */
export function eventsByDay(y: number, m: number, events: ScheduleEvent[]): Map<string, ScheduleEvent[]> {
  const out = new Map<string, ScheduleEvent[]>()
  const total = daysInMonth(y, m)
  for (const ev of [...events].sort(compareEvents)) {
    const { start, end } = eventDayRange(ev)
    for (let d = 1; d <= total; d++) {
      const n = dayNumber(y, m, d)
      if (n >= start && n <= end) {
        const k = dayKey(y, m, d)
        out.set(k, [...(out.get(k) ?? []), ev])
      }
    }
  }
  return out
}

/** 이 달에 일정이 있는지, 일정이 있는 첫 달과 마지막 달(이전달/다음달 버튼 활성 판단용) */
export function eventMonthSpan(events: ScheduleEvent[]): { first: Ymd; last: Ymd } | null {
  if (events.length === 0) return null
  let min = Infinity
  let max = -Infinity
  for (const ev of events) {
    const { start, end } = eventDayRange(ev)
    min = Math.min(min, start)
    max = Math.max(max, end)
  }
  const a = new Date(min * DAY_MS)
  const b = new Date(max * DAY_MS)
  return {
    first: { y: a.getUTCFullYear(), m: a.getUTCMonth() + 1, d: a.getUTCDate() },
    last: { y: b.getUTCFullYear(), m: b.getUTCMonth() + 1, d: b.getUTCDate() },
  }
}

export function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const t = y * 12 + (m - 1) + delta
  return { y: Math.floor(t / 12), m: (t % 12) + 1 }
}

export function filterByLabel(events: ScheduleEvent[], labelId: string | null): ScheduleEvent[] {
  return labelId === null ? events : events.filter((e) => e.labelId === labelId)
}

// ── 표기 (한국어 / 영어) ────────────────────────────────────────────────

export type UiLocale = 'ko' | 'en'

/** SDK가 알려주는 언어 코드를 지원 언어로 줄인다. 모르는 언어는 영어 */
export function uiLocale(code: string | undefined | null): UiLocale {
  return code && code.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

const BCP: Record<UiLocale, string> = { ko: 'ko-KR', en: 'en-US' }
const TZ = 'Asia/Seoul'

export function monthTitle(locale: UiLocale, y: number, m: number): string {
  if (locale === 'ko') return `${m}월, ${y}`
  const name = new Intl.DateTimeFormat(BCP.en, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
  return `${name}, ${y}`
}

export function weekdayShort(locale: UiLocale, dow: number): string {
  return new Intl.DateTimeFormat(BCP[locale], { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + dow)))
}

export function weekdayLong(locale: UiLocale, dow: number): string {
  return new Intl.DateTimeFormat(BCP[locale], { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + dow)))
}

export function dayNumberLabel(locale: UiLocale, d: number): string {
  return locale === 'ko' ? `${d}일` : String(d)
}

/** 목록의 날짜 묶음 제목 왼쪽: ko "23일 금요일" · en "24 Saturday" */
export function dayHeading(locale: UiLocale, d: number, dow: number): string {
  return `${dayNumberLabel(locale, d)} ${weekdayLong(locale, dow)}`
}

/** 목록의 날짜 묶음 제목 오른쪽: ko "2026. 10. 23." · en "10/24/2026" */
export function dayFull(locale: UiLocale, y: number, m: number, d: number): string {
  return new Intl.DateTimeFormat(BCP[locale], { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** ko "오전 12:00" · en "08:00 AM" (목록 카드용, 시를 두 자리로) */
export function timeLabel(locale: UiLocale, isoValue: string): string {
  return new Intl.DateTimeFormat(BCP[locale], { hour: locale === 'en' ? '2-digit' : 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).format(new Date(isoValue))
}

/** 상세 팝업의 일시. 종일이면 날짜만, 여러 날이면 "시작 ~ 종료" */
export function whenLabel(locale: UiLocale, ev: ScheduleEvent): string {
  const fmt = (v: string, withTime: boolean) =>
    new Intl.DateTimeFormat(BCP[locale], {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      ...(withTime ? { hour: 'numeric', minute: '2-digit', hour12: true } : {}),
      timeZone: TZ,
    }).format(new Date(v))
  const withTime = !ev.allDay
  const a = fmt(ev.startAt, withTime)
  if (!ev.endAt) return a
  const b = fmt(ev.endAt, withTime)
  return a === b ? a : `${a} ~ ${b}`
}

// ── 링크, 캘린더 ────────────────────────────────────────────────────────

/** 팬 페이지 주소. base는 `https://<스테이지>/star-schedule` */
export function pageUrl(base: string, slug: string, eventId?: string | null): string {
  const q = new URLSearchParams({ p: slug })
  if (eventId) q.set('e', eventId)
  return `${base}?${q.toString()}`
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function icsUtc(isoValue: string): string {
  const t = new Date(isoValue)
  return `${t.getUTCFullYear()}${pad2(t.getUTCMonth() + 1)}${pad2(t.getUTCDate())}T${pad2(t.getUTCHours())}${pad2(t.getUTCMinutes())}${pad2(t.getUTCSeconds())}Z`
}

/** 종일 일정의 KST 날짜 `YYYYMMDD`. extraDays=1이면 종료일(미포함) */
function icsDate(isoValue: string, extraDays = 0): string {
  const k = toKst(isoValue)
  const t = new Date(Date.UTC(k.y, k.m - 1, k.d + extraDays))
  return `${t.getUTCFullYear()}${pad2(t.getUTCMonth() + 1)}${pad2(t.getUTCDate())}`
}

function eventSpan(ev: ScheduleEvent): { start: string; end: string; allDay: boolean } {
  if (ev.allDay) {
    const last = ev.endAt ?? ev.startAt
    return { start: icsDate(ev.startAt), end: icsDate(last, 1), allDay: true }
  }
  const end = ev.endAt ?? new Date(Date.parse(ev.startAt) + 60 * 60 * 1000).toISOString()
  return { start: icsUtc(ev.startAt), end: icsUtc(end), allDay: false }
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** 75바이트를 넘는 줄은 접는다(다음 줄은 공백으로 시작). 멀티바이트 글자는 쪼개지 않는다 */
function foldLine(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let bytes = 0
  let limit = 75
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > limit) {
      parts.push(cur)
      cur = ''
      bytes = 0
      limit = 74
    }
    cur += ch
    bytes += n
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

/** 일정 한 건의 .ics 파일 내용(CRLF 줄바꿈). now는 테스트에서 고정할 수 있다 */
export function buildIcs(ev: ScheduleEvent, opts: { pageName: string; url: string; now?: Date }): string {
  const span = eventSpan(ev)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//star-schedule//KO',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.id}@star-schedule`,
    `DTSTAMP:${icsUtc((opts.now ?? new Date()).toISOString())}`,
    span.allDay ? `DTSTART;VALUE=DATE:${span.start}` : `DTSTART:${span.start}`,
    span.allDay ? `DTEND;VALUE=DATE:${span.end}` : `DTEND:${span.end}`,
    `SUMMARY:${icsEscape(ev.title)}`,
  ]
  const desc = [ev.description, ev.link, opts.url].filter(Boolean).join('\n')
  if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`)
  lines.push(`URL:${opts.url}`, 'END:VEVENT', 'END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/** Google 캘린더 일정 등록 링크 */
export function googleCalendarUrl(ev: ScheduleEvent, opts: { url: string }): string {
  const span = eventSpan(ev)
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${span.start}/${span.end}`,
    details: [ev.description, ev.link, opts.url].filter(Boolean).join('\n'),
  })
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}

export function icsFileName(ev: ScheduleEvent): string {
  const base = ev.title.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return `${base || 'event'}.ics`
}
