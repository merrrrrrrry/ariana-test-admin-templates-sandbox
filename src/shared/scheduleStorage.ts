import { client } from './client'
import { isLocalPreview } from './storage'
import {
  EMPTY_INDEX,
  INDEX_KEY,
  LOCAL_INDEX_STORAGE_KEY,
  LOCAL_PAGE_STORAGE_PREFIX,
  assertSafeKeys,
  emptyPage,
  indexEntryOf,
  isTombstone,
  isValidSlug,
  makeTombstone,
  parseIndex,
  parseSchedulePage,
  scheduleKey,
  unwrapData,
  type ScheduleIndex,
  type SchedulePage,
} from './starScheduleConfig'

// ────────────────────────────────────────────────────────────────────────
// 스타 일정 페이지 저장소 (custom-template-data). 페이지마다 레코드 하나(star-schedule-<슬러그>) + 목록 레코드 하나(star-schedule-index).
// 팬은 페이지 레코드만 읽는다. 로컬(localhost)에서는 어드민 호출이 없어 브라우저 저장(localStorage)으로 대신한다.
// ────────────────────────────────────────────────────────────────────────

const PATH = '/home/v1/custom-template-data/{displayKey}'
const CREATE_PATH = '/home/v1/custom-template-data'

const isNotFound = (err: unknown) => typeof err === 'object' && err !== null && (err as { status?: number }).status === 404

interface RawRecord {
  exists: boolean
  data: unknown
  /** 서버가 저장할 때 기록한 운영자 ID와 시각 */
  savedById: string | null
  savedAt: string | null
}

async function readRecord(key: string): Promise<RawRecord> {
  try {
    const res = await client.get<unknown>(PATH, { path: { displayKey: key } })
    const body = res.data && typeof res.data === 'object' ? (res.data as Record<string, unknown>) : {}
    const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
    return { exists: true, data: unwrapData(res.data), savedById: str(body.updatedBy), savedAt: str(body.updatedAt) }
  } catch (err) {
    if (isNotFound(err)) return { exists: false, data: null, savedById: null, savedAt: null }
    throw err
  }
}

async function writeRecord(key: string, data: unknown, exists: boolean): Promise<void> {
  assertSafeKeys(data)
  if (exists) await client.put(PATH, { path: { displayKey: key }, body: { data } })
  else await client.post(CREATE_PATH, { body: { displayKey: key, data } })
}

function localGet(key: string): unknown {
  try {
    const v = window.localStorage.getItem(key)
    return v ? JSON.parse(v) : null
  } catch {
    return null
  }
}

function localSet(key: string, value: unknown): void {
  window.localStorage.setItem(key, JSON.stringify(value))
}

// ── 목록 ────────────────────────────────────────────────────────────────

export async function readIndex(): Promise<{ index: ScheduleIndex; exists: boolean }> {
  if (isLocalPreview()) {
    const raw = localGet(LOCAL_INDEX_STORAGE_KEY)
    return { index: raw ? parseIndex(raw) : EMPTY_INDEX, exists: raw !== null }
  }
  const rec = await readRecord(INDEX_KEY)
  return { index: rec.exists ? parseIndex(rec.data) : EMPTY_INDEX, exists: rec.exists }
}

async function writeIndex(index: ScheduleIndex, exists: boolean): Promise<void> {
  if (isLocalPreview()) return localSet(LOCAL_INDEX_STORAGE_KEY, index)
  await writeRecord(INDEX_KEY, index, exists)
}

/** 목록에서 한 건을 바꾸거나 지운다(읽고 → 바꾸고 → 쓴다). entry가 null이면 지운다 */
async function mutateIndex(slug: string, page: SchedulePage | null): Promise<void> {
  const { index, exists } = await readIndex()
  const rest = index.pages.filter((p) => p.slug !== slug)
  const next = page ? [...rest, indexEntryOf(page)] : rest
  next.sort((a, b) => a.star.localeCompare(b.star) || a.name.localeCompare(b.name))
  await writeIndex({ version: 1, pages: next }, exists)
}

// ── 페이지 ──────────────────────────────────────────────────────────────

export interface LoadedPage {
  page: SchedulePage
  /** 불러온 시점의 내용(저장 때 충돌을 알아채는 기준) */
  snapshot: string
  savedById: string | null
  savedAt: string | null
}

export const snapshotOf = (page: SchedulePage) => JSON.stringify(page)

export async function readPage(slug: string): Promise<LoadedPage | null> {
  if (isLocalPreview()) {
    const raw = localGet(LOCAL_PAGE_STORAGE_PREFIX + slug)
    const page = raw && !isTombstone(raw) ? parseSchedulePage(raw) : null
    return page ? { page, snapshot: snapshotOf(page), savedById: null, savedAt: null } : null
  }
  const rec = await readRecord(scheduleKey(slug))
  if (!rec.exists || isTombstone(rec.data)) return null
  const page = parseSchedulePage(rec.data)
  return page ? { page, snapshot: snapshotOf(page), savedById: rec.savedById, savedAt: rec.savedAt } : null
}

export type SaveResult = { ok: true; page: SchedulePage } | { ok: false; reason: 'conflict'; at: string | null }

/** 저장. 불러온 뒤 다른 운영자가 먼저 바꿨으면 conflict를 돌려준다(force면 그대로 덮어쓴다) */
export async function savePage(next: SchedulePage, loadedSnapshot: string, force = false): Promise<SaveResult> {
  const stamped: SchedulePage = { ...next, updatedAt: new Date().toISOString() }
  const clean = parseSchedulePage(stamped)
  if (!clean) throw new Error('저장할 수 없는 내용이에요 (슬러그 확인)')
  if (isLocalPreview()) {
    const current = localGet(LOCAL_PAGE_STORAGE_PREFIX + clean.slug)
    const cur = current && !isTombstone(current) ? parseSchedulePage(current) : null
    if (!force && cur && snapshotOf(cur) !== loadedSnapshot) return { ok: false, reason: 'conflict', at: cur.updatedAt }
    localSet(LOCAL_PAGE_STORAGE_PREFIX + clean.slug, clean)
    await mutateIndex(clean.slug, clean)
    return { ok: true, page: clean }
  }
  const key = scheduleKey(clean.slug)
  const rec = await readRecord(key)
  const cur = rec.exists && !isTombstone(rec.data) ? parseSchedulePage(rec.data) : null
  if (!force && cur && snapshotOf(cur) !== loadedSnapshot) return { ok: false, reason: 'conflict', at: rec.savedAt ?? cur.updatedAt }
  await writeRecord(key, clean, rec.exists)
  await mutateIndex(clean.slug, clean)
  return { ok: true, page: clean }
}

export type CreateResult = { ok: true; page: SchedulePage } | { ok: false; reason: 'invalid-slug' | 'exists' }

/** 새 일정 페이지. 슬러그가 이미 쓰이고 있으면(삭제 표시는 제외) 만들지 않는다 */
export async function createPage(slug: string, name: string, star: string): Promise<CreateResult> {
  if (!isValidSlug(slug)) return { ok: false, reason: 'invalid-slug' }
  const page = emptyPage(slug, name.trim() || slug, star.trim())
  if (isLocalPreview()) {
    const cur = localGet(LOCAL_PAGE_STORAGE_PREFIX + slug)
    if (cur && !isTombstone(cur)) return { ok: false, reason: 'exists' }
    const saved = { ...page, updatedAt: new Date().toISOString() }
    localSet(LOCAL_PAGE_STORAGE_PREFIX + slug, saved)
    await mutateIndex(slug, saved)
    return { ok: true, page: saved }
  }
  const rec = await readRecord(scheduleKey(slug))
  if (rec.exists && !isTombstone(rec.data)) return { ok: false, reason: 'exists' }
  const saved = { ...page, updatedAt: new Date().toISOString() }
  await writeRecord(scheduleKey(slug), saved, rec.exists)
  await mutateIndex(slug, saved)
  return { ok: true, page: saved }
}

/**
 * 일정 페이지 삭제. 저장소 삭제를 먼저 시도하고, 지원하지 않거나 실패하면 "삭제 표시"로 덮어쓴다(팬 화면은 없는 페이지로 본다).
 * 어느 방식으로 지워졌는지 돌려준다 — 삭제 API가 실제로 동작하는지는 라이브에서 확인해야 한다.
 */
export async function removePage(slug: string): Promise<'deleted' | 'tombstone'> {
  if (isLocalPreview()) {
    window.localStorage.removeItem(LOCAL_PAGE_STORAGE_PREFIX + slug)
    await mutateIndex(slug, null)
    return 'deleted'
  }
  let how: 'deleted' | 'tombstone' = 'deleted'
  try {
    await client.delete(PATH, { path: { displayKey: scheduleKey(slug) } })
  } catch {
    how = 'tombstone'
    const rec = await readRecord(scheduleKey(slug))
    await writeRecord(scheduleKey(slug), makeTombstone(slug), rec.exists)
  }
  await mutateIndex(slug, null)
  return how
}
