import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { color, textStyle } from '@bstage-sdk/design/admin'
import { createPage, readIndex, readPage, removePage, savePage, snapshotOf, type LoadedPage } from './scheduleStorage'
import { resolveOperatorName } from './storage'
import {
  LABEL_COLORS,
  LIMITS,
  fromKst,
  isValidSlug,
  makeId,
  pageUrl,
  toKst,
  whenLabel,
  type ScheduleEvent,
  type ScheduleIndex,
  type ScheduleIndexEntry,
  type ScheduleLabel,
  type SchedulePage,
  type Visibility,
} from './starScheduleConfig'

// ────────────────────────────────────────────────────────────────────────
// 스타 일정 관리 — 어드민 설정 화면. 스타별 일정 페이지를 만들고, 공개 범위·라벨·일정을 관리하고, 팬 페이지 링크를 복사한다.
// 팬 화면은 유저 레포의 star-schedule 페이지. 기획서: star-schedule/spec.md
// ────────────────────────────────────────────────────────────────────────

const BRAND = `var(--button-color, ${color.surface['form-bstage']})`
const FAN_BASE_STORAGE_KEY = 'star-schedule-fan-base'

const inputStyle: CSSProperties = {
  ...textStyle('13/body/reg'),
  width: '100%',
  boxSizing: 'border-box',
  height: 36,
  padding: '0 12px',
  borderRadius: 6,
  border: '0.8px solid transparent',
  background: color.surface['form-weak-a'],
  color: color.text.primary,
}

const textareaStyle: CSSProperties = { ...inputStyle, height: 96, padding: '8px 12px', resize: 'vertical', lineHeight: '20px' }

const cardStyle: CSSProperties = {
  background: color.bg.base,
  border: `1px solid ${color.border['divider-a']}`,
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
}

function buttonStyle(kind: 'primary' | 'secondary' | 'ghost' | 'danger', disabled = false): CSSProperties {
  return {
    ...textStyle('13/body/med'),
    height: 36,
    padding: '0 14px',
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    border: kind === 'primary' ? 'none' : `1px solid ${color.border['default-a']}`,
    background: kind === 'primary' ? BRAND : kind === 'ghost' ? 'transparent' : color.bg.base,
    color: kind === 'primary' ? color.bg.base : kind === 'danger' ? color.text.red : color.text.primary,
    whiteSpace: 'nowrap',
  }
}

const hint: CSSProperties = { ...textStyle('12/body/reg'), color: color.text['sub-a'], margin: '4px 0 0' }

function Field({ label, hintText, children }: { label: string; hintText?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ ...textStyle('13/body/med'), color: color.text.primary, display: 'block', marginBottom: 6 }}>{label}</span>
      {children}
      {hintText && <span style={{ ...hint, display: 'block' }}>{hintText}</span>}
    </label>
  )
}

function formatKst(isoValue: string): string {
  const k = toKst(isoValue)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${k.y}. ${p(k.m)}. ${p(k.d)}. ${p(k.h)}:${p(k.mi)} (KST)`
}

const VISIBILITY_LABEL: Record<Visibility, string> = { public: '공개 (누구나)', login: '비공개 (로그인한 팬만)' }

function defaultFanBase(): string {
  try {
    const saved = window.localStorage.getItem(FAN_BASE_STORAGE_KEY)
    if (saved) return saved
  } catch {
    // 저장소를 못 읽어도 기본값을 쓴다.
  }
  const origin = window.location.origin.replace('.mysandstage.in', '.sandstage.in')
  return `${origin}/star-schedule`
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    window.prompt('링크를 복사하세요', text)
    return false
  }
}

// ── 일정 입력 양식 ──────────────────────────────────────────────────────

interface EventForm {
  id: string | null
  title: string
  allDay: boolean
  startDate: string
  startTime: string
  hasEnd: boolean
  endDate: string
  endTime: string
  labelId: string
  link: string
  description: string
}

const p2 = (n: number) => String(n).padStart(2, '0')
const dateStr = (y: number, m: number, d: number) => `${y}-${p2(m)}-${p2(d)}`

function blankForm(): EventForm {
  const k = toKst(new Date().toISOString())
  return { id: null, title: '', allDay: false, startDate: dateStr(k.y, k.m, k.d), startTime: '12:00', hasEnd: false, endDate: dateStr(k.y, k.m, k.d), endTime: '13:00', labelId: '', link: '', description: '' }
}

function formOf(ev: ScheduleEvent): EventForm {
  const s = toKst(ev.startAt)
  const e = ev.endAt ? toKst(ev.endAt) : s
  return {
    id: ev.id,
    title: ev.title,
    allDay: ev.allDay,
    startDate: dateStr(s.y, s.m, s.d),
    startTime: `${p2(s.h)}:${p2(s.mi)}`,
    hasEnd: ev.endAt !== null,
    endDate: dateStr(e.y, e.m, e.d),
    endTime: `${p2(e.h)}:${p2(e.mi)}`,
    labelId: ev.labelId ?? '',
    link: ev.link ?? '',
    description: ev.description ?? '',
  }
}

function toIso(date: string, time: string, allDay: boolean): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!d) return null
  const t = allDay ? /^(\d{2}):(\d{2})$/.exec('00:00') : /^(\d{2}):(\d{2})$/.exec(time)
  if (!t) return null
  return fromKst(Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2]))
}

/** 양식 → 일정. 잘못된 입력이면 사유 문자열을 돌려준다 */
function eventOfForm(f: EventForm, labelIds: Set<string>): ScheduleEvent | string {
  const title = f.title.trim()
  if (!title) return '제목을 입력해 주세요.'
  if (title.length > LIMITS.title) return `제목은 ${LIMITS.title}자까지예요.`
  const startAt = toIso(f.startDate, f.startTime, f.allDay)
  if (!startAt) return '시작 날짜와 시간을 확인해 주세요.'
  let endAt: string | null = null
  if (f.hasEnd) {
    endAt = toIso(f.endDate, f.endTime, f.allDay)
    if (!endAt) return '종료 날짜와 시간을 확인해 주세요.'
    if (Date.parse(endAt) < Date.parse(startAt)) return '종료가 시작보다 빨라요.'
  }
  const link = f.link.trim()
  if (link && !/^https?:\/\/\S+$/i.test(link)) return '링크는 http:// 또는 https:// 로 시작해야 해요.'
  if (link.length > LIMITS.link) return `링크는 ${LIMITS.link}자까지예요.`
  if (f.description.length > LIMITS.description) return `설명은 ${LIMITS.description}자까지예요.`
  return {
    id: f.id ?? makeId('e'),
    title,
    allDay: f.allDay,
    startAt,
    endAt,
    labelId: f.labelId && labelIds.has(f.labelId) ? f.labelId : null,
    link: link || null,
    description: f.description.trim() || null,
  }
}

function EventEditor({
  form,
  setForm,
  labels,
  error,
  onSubmit,
  onCancel,
}: {
  form: EventForm
  setForm: (f: EventForm) => void
  labels: ScheduleLabel[]
  error: string | null
  onSubmit: () => void
  onCancel: () => void
}) {
  const set = (patch: Partial<EventForm>) => setForm({ ...form, ...patch })
  const row: CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap' }
  return (
    <div style={{ ...cardStyle, background: color.bg['grouped-default'], marginTop: 12 }}>
      <div style={{ ...textStyle('14/title/med'), color: color.text.primary, marginBottom: 12 }}>{form.id ? '일정 수정' : '새 일정'}</div>
      <Field label="제목">
        <input style={inputStyle} value={form.title} maxLength={LIMITS.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, ...textStyle('13/body/med'), color: color.text.primary }}>
        <input type="checkbox" checked={form.allDay} style={{ width: 18, height: 18, accentColor: BRAND }} onChange={(e) => set({ allDay: e.target.checked })} />
        종일 일정
      </label>
      <div style={row}>
        <div style={{ flex: '1 1 180px' }}>
          <Field label="시작 날짜">
            <input type="date" style={inputStyle} value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </Field>
        </div>
        {!form.allDay && (
          <div style={{ flex: '1 1 140px' }}>
            <Field label="시작 시간">
              <input type="time" style={inputStyle} value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} />
            </Field>
          </div>
        )}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, ...textStyle('13/body/med'), color: color.text.primary }}>
        <input type="checkbox" checked={form.hasEnd} style={{ width: 18, height: 18, accentColor: BRAND }} onChange={(e) => set({ hasEnd: e.target.checked })} />
        종료 날짜·시간 입력 (여러 날에 걸친 일정)
      </label>
      {form.hasEnd && (
        <div style={row}>
          <div style={{ flex: '1 1 180px' }}>
            <Field label="종료 날짜">
              <input type="date" style={inputStyle} value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
            </Field>
          </div>
          {!form.allDay && (
            <div style={{ flex: '1 1 140px' }}>
              <Field label="종료 시간">
                <input type="time" style={inputStyle} value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} />
              </Field>
            </div>
          )}
        </div>
      )}
      <Field label="라벨" hintText={labels.length === 0 ? '라벨은 위 "라벨" 칸에서 먼저 만들어 주세요. 없어도 저장할 수 있어요.' : undefined}>
        <select style={inputStyle} value={form.labelId} onChange={(e) => set({ labelId: e.target.value })}>
          <option value="">라벨 없음</option>
          {labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="링크 (선택)" hintText="일정을 열었을 때 보이는 링크예요. http:// 또는 https:// 로 시작해야 해요.">
        <input style={inputStyle} value={form.link} maxLength={LIMITS.link} placeholder="https://" onChange={(e) => set({ link: e.target.value })} />
      </Field>
      <Field label="설명 (선택)" hintText={`글자만 입력해요. 줄바꿈은 그대로 보여요. ${form.description.length}/${LIMITS.description}`}>
        <textarea style={textareaStyle} value={form.description} maxLength={LIMITS.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      {error && (
        <p role="alert" style={{ ...textStyle('13/body/med'), color: color.text.red, margin: '0 0 12px' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={buttonStyle('primary')} onClick={onSubmit}>
          {form.id ? '일정 수정 반영' : '일정 추가'}
        </button>
        <button type="button" style={buttonStyle('secondary')} onClick={onCancel}>
          취소
        </button>
      </div>
      <p style={hint}>여기서 추가·수정한 내용은 아래 "저장"을 눌러야 저장돼요. 시간은 한국 시간이에요.</p>
    </div>
  )
}

// ── 라벨 ────────────────────────────────────────────────────────────────

function LabelsEditor({ labels, onChange }: { labels: ScheduleLabel[]; onChange: (next: ScheduleLabel[]) => void }) {
  const update = (id: string, patch: Partial<ScheduleLabel>) => onChange(labels.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  return (
    <div style={cardStyle}>
      <div style={{ ...textStyle('16/title/bold'), color: color.text.primary, margin: '0 0 4px' }}>라벨</div>
      <p style={{ ...hint, margin: '0 0 12px' }}>일정을 종류별로 나누는 이름표예요. 색은 정해진 7가지 중에서 골라요. 라벨을 지우면 그 라벨의 일정은 "라벨 없음"이 돼요.</p>
      {labels.map((l) => (
        <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <input
            aria-label="라벨 이름"
            style={{ ...inputStyle, width: 180 }}
            value={l.name}
            maxLength={LIMITS.labelName}
            placeholder="라벨 이름"
            onChange={(e) => update(l.id, { name: e.target.value })}
          />
          <div style={{ display: 'flex', gap: 6 }} role="radiogroup" aria-label="라벨 색">
            {LABEL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={l.color === c}
                aria-label={c}
                onClick={() => update(l.id, { color: c })}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: c,
                  border: l.color === c ? `2px solid ${color.text.primary}` : '2px solid transparent',
                  padding: 0,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
          <button type="button" style={buttonStyle('danger')} onClick={() => onChange(labels.filter((x) => x.id !== l.id))}>
            삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        style={buttonStyle('secondary', labels.length >= LIMITS.labels)}
        disabled={labels.length >= LIMITS.labels}
        onClick={() => onChange([...labels, { id: makeId('l'), name: '', color: LABEL_COLORS[labels.length % LABEL_COLORS.length] }])}
      >
        라벨 추가
      </button>
    </div>
  )
}

// ── 페이지 편집 ─────────────────────────────────────────────────────────

function PageEditor({ slug, fanBase, onBack, onChanged }: { slug: string; fanBase: string; onBack: () => void; onChanged: () => void }) {
  const [loaded, setLoaded] = useState<LoadedPage | null>(null)
  const [draft, setDraft] = useState<SchedulePage | null>(null)
  const [missing, setMissing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; message: string } | { kind: 'conflict'; at: string | null }>({ kind: 'idle' })
  const [form, setForm] = useState<EventForm | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [savedBy, setSavedBy] = useState<string | null>(null)

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    readPage(slug)
      .then((res) => {
        if (!alive) return
        if (!res) {
          setMissing(true)
          return
        }
        setLoaded(res)
        setDraft(res.page)
        setSavedBy(null)
        if (res.savedById) resolveOperatorName(res.savedById).then((name) => alive && name && setSavedBy(name))
      })
      .catch((err) => alive && setLoadError(err instanceof Error ? err.message : '불러오지 못했어요'))
    return () => {
      alive = false
    }
  }, [slug, attempt])

  const load = useCallback(() => {
    setLoadError(null)
    setMissing(false)
    setLoaded(null)
    setDraft(null)
    setAttempt((n) => n + 1)
  }, [])

  const dirty = loaded !== null && draft !== null && snapshotOf(draft) !== loaded.snapshot
  const labelIds = useMemo(() => new Set((draft?.labels ?? []).map((l) => l.id)), [draft])
  const sorted = useMemo(() => [...(draft?.events ?? [])].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)), [draft])

  const patch = (partial: Partial<SchedulePage>) => {
    setStatus({ kind: 'idle' })
    setDraft((cur) => (cur ? { ...cur, ...partial } : cur))
  }

  const save = async (force = false) => {
    if (!loaded || !draft) return
    setSaving(true)
    setStatus({ kind: 'idle' })
    try {
      // 라벨을 지웠다면 그 라벨을 쓰던 일정은 "라벨 없음"으로 정리한다(저장 직전에 한 번 더).
      const ids = new Set(draft.labels.filter((l) => l.name.trim()).map((l) => l.id))
      const cleaned: SchedulePage = {
        ...draft,
        labels: draft.labels.filter((l) => l.name.trim()),
        events: draft.events.map((e) => (e.labelId && !ids.has(e.labelId) ? { ...e, labelId: null } : e)),
      }
      const res = await savePage(cleaned, loaded.snapshot, force)
      if (!res.ok) {
        setStatus({ kind: 'conflict', at: res.at })
      } else {
        const next: LoadedPage = { page: res.page, snapshot: snapshotOf(res.page), savedById: null, savedAt: res.page.updatedAt }
        setLoaded(next)
        setDraft(res.page)
        setStatus({ kind: 'saved' })
        onChanged()
      }
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : '저장하지 못했어요' })
    } finally {
      setSaving(false)
    }
  }

  const submitForm = () => {
    if (!form || !draft) return
    const result = eventOfForm(form, labelIds)
    if (typeof result === 'string') return setFormError(result)
    if (!form.id && draft.events.length >= LIMITS.events) return setFormError(`일정은 페이지당 ${LIMITS.events}건까지예요.`)
    const events = form.id ? draft.events.map((e) => (e.id === result.id ? result : e)) : [...draft.events, result]
    patch({ events })
    setForm(null)
    setFormError(null)
  }

  if (loadError)
    return (
      <div>
        <p style={{ ...textStyle('15/body/reg'), color: color.text.red }}>{loadError}</p>
        <button type="button" style={buttonStyle('secondary')} onClick={load}>
          다시 불러오기
        </button>
      </div>
    )
  if (missing)
    return (
      <div>
        <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary }}>이 일정 페이지를 찾을 수 없어요. 삭제됐을 수 있어요.</p>
        <button type="button" style={buttonStyle('secondary')} onClick={onBack}>
          목록으로
        </button>
      </div>
    )
  if (!draft || !loaded) return <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary }}>불러오는 중…</p>

  const url = pageUrl(fanBase, draft.slug)
  const monthOf = (ev: ScheduleEvent) => {
    const k = toKst(ev.startAt)
    return `${k.y}년 ${k.m}월`
  }

  return (
    <div>
      <button type="button" style={{ ...buttonStyle('ghost'), marginBottom: 12 }} onClick={onBack}>
        ← 목록으로
      </button>
      <h2 style={{ ...textStyle('20/title/bold'), color: color.text.primary, margin: '0 0 4px' }}>{draft.name}</h2>
      <p style={{ ...textStyle('13/body/med'), color: color.text['sub-a'], margin: '0 0 16px' }}>
        {draft.updatedAt ? `마지막 수정: ${savedBy ? `${savedBy} · ` : ''}${formatKst(draft.updatedAt)}` : '아직 저장한 적이 없어요.'}
      </p>

      <div style={cardStyle}>
        <div style={{ ...textStyle('16/title/bold'), color: color.text.primary, margin: '0 0 12px' }}>기본 정보</div>
        <Field label="페이지 이름">
          <input style={inputStyle} value={draft.name} maxLength={LIMITS.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label="스타 이름">
          <input style={inputStyle} value={draft.star} maxLength={LIMITS.star} onChange={(e) => patch({ star: e.target.value })} />
        </Field>
        <Field
          label="공개 범위"
          hintText='비공개는 로그인한 팬에게만 보여요. 화면에서 가리는 방식이라, 개발자 도구로 공개 API를 직접 부르면 데이터는 읽힐 수 있어요. 비밀이 필요한 일정은 올리지 마세요.'
        >
          <select style={inputStyle} value={draft.visibility} onChange={(e) => patch({ visibility: e.target.value === 'login' ? 'login' : 'public' })}>
            <option value="public">{VISIBILITY_LABEL.public}</option>
            <option value="login">{VISIBILITY_LABEL.login}</option>
          </select>
        </Field>
        <Field label="팬 페이지 링크" hintText="저장한 뒤 약 1분 안에 팬 화면에서 열려요. 메뉴나 배너에 이 링크를 붙여 넣으세요.">
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly style={inputStyle} value={url} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" style={buttonStyle('secondary')} onClick={() => copyText(url)}>
              링크 복사
            </button>
          </div>
        </Field>
      </div>

      <LabelsEditor labels={draft.labels} onChange={(labels) => patch({ labels })} />

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div style={{ ...textStyle('16/title/bold'), color: color.text.primary }}>일정 ({draft.events.length})</div>
          <button
            type="button"
            style={buttonStyle('secondary')}
            onClick={() => {
              setForm(blankForm())
              setFormError(null)
            }}
          >
            일정 추가
          </button>
        </div>
        {form && <EventEditor form={form} setForm={setForm} labels={draft.labels} error={formError} onSubmit={submitForm} onCancel={() => setForm(null)} />}
        {sorted.length === 0 && !form && <p style={hint}>아직 일정이 없어요. "일정 추가"를 눌러 첫 일정을 만들어 보세요.</p>}
        {sorted.map((ev, i) => {
          const month = monthOf(ev)
          const header = i === 0 || monthOf(sorted[i - 1]) !== month
          const label = draft.labels.find((l) => l.id === ev.labelId)
          return (
            <div key={ev.id}>
              {header && <div style={{ ...textStyle('13/body/med'), color: color.text['sub-a'], margin: '16px 0 6px' }}>{month}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: `1px solid ${color.border['divider-a']}` }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', flex: 'none', background: label?.color ?? 'transparent', border: label ? 'none' : `1px solid ${color.border['default-a']}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...textStyle('13/body/med'), color: color.text.primary, wordBreak: 'break-word' }}>{ev.title}</div>
                  <div style={{ ...textStyle('12/body/reg'), color: color.text['sub-a'] }}>
                    {whenLabel('ko', ev)}
                    {ev.allDay ? ' · 종일' : ''}
                    {label ? ` · ${label.name}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  style={buttonStyle('secondary')}
                  onClick={() => {
                    setForm(formOf(ev))
                    setFormError(null)
                  }}
                >
                  수정
                </button>
                <button type="button" style={buttonStyle('danger')} onClick={() => patch({ events: draft.events.filter((e) => e.id !== ev.id) })}>
                  삭제
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div
        style={{
          position: 'sticky',
          bottom: 0,
          padding: '12px 16px',
          background: color.bg.base,
          border: `1px solid ${color.border['default-a']}`,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            ...textStyle('13/body/med'),
            flex: 1,
            minWidth: 180,
            color: status.kind === 'error' || status.kind === 'conflict' ? color.text.red : color.text.secondary,
          }}
        >
          {status.kind === 'saved' && '저장했어요. 팬 화면에 약 1분 안에 반영돼요.'}
          {status.kind === 'error' && `저장하지 못했어요: ${status.message}`}
          {status.kind === 'conflict' &&
            `${status.at ? `다른 운영자가 ${formatKst(status.at)}에` : '다른 운영자가'} 먼저 이 페이지를 바꿨어요. 그래도 내 내용으로 저장할까요?`}
          {status.kind === 'idle' && (dirty ? '저장하지 않은 변경이 있어요.' : '변경 사항이 없어요.')}
        </span>
        {status.kind === 'conflict' ? (
          <>
            <button type="button" style={buttonStyle('secondary')} onClick={load}>
              다시 불러오기
            </button>
            <button type="button" style={buttonStyle('primary', saving)} disabled={saving} onClick={() => save(true)}>
              덮어쓰기
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              style={buttonStyle('ghost', !dirty || saving)}
              disabled={!dirty || saving}
              onClick={() => {
                setDraft(loaded.page)
                setForm(null)
                setStatus({ kind: 'idle' })
              }}
            >
              되돌리기
            </button>
            <button type="button" style={buttonStyle('primary', !dirty || saving)} disabled={!dirty || saving} onClick={() => save()}>
              {saving ? '저장 중…' : '저장'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── 목록 ────────────────────────────────────────────────────────────────

function PageList({ index, fanBase, setFanBase, onOpen, onReload }: { index: ScheduleIndex; fanBase: string; setFanBase: (v: string) => void; onOpen: (slug: string) => void; onReload: () => void }) {
  const [name, setName] = useState('')
  const [star, setStar] = useState('')
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const slugOk = slug === '' || isValidSlug(slug)
  const taken = index.pages.some((p) => p.slug === slug)

  const create = async () => {
    if (!isValidSlug(slug) || taken) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await createPage(slug, name, star)
      if (!res.ok) setMessage(res.reason === 'exists' ? '이미 쓰고 있는 주소 이름이에요.' : '주소 이름은 영문 소문자·숫자·하이픈만, 30자까지예요.')
      else {
        setName('')
        setStar('')
        setSlug('')
        onReload()
        onOpen(res.page.slug)
      }
    } catch (err) {
      setMessage(`만들지 못했어요: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    } finally {
      setBusy(false)
    }
  }

  const changeVisibility = async (entry: ScheduleIndexEntry, visibility: Visibility) => {
    setMessage(null)
    try {
      const cur = await readPage(entry.slug)
      if (!cur) return setMessage('이 페이지를 찾을 수 없어요.')
      const res = await savePage({ ...cur.page, visibility }, cur.snapshot)
      if (!res.ok) setMessage('다른 운영자가 먼저 바꿨어요. 페이지를 열어서 확인해 주세요.')
      onReload()
    } catch (err) {
      setMessage(`바꾸지 못했어요: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    }
  }

  const remove = async (entry: ScheduleIndexEntry) => {
    if (!window.confirm(`"${entry.name}" 일정 페이지를 삭제할까요?\n일정 ${entry.eventCount}건도 함께 지워지고 되돌릴 수 없어요. 이 페이지의 링크는 "없는 일정 페이지"로 보여요.`)) return
    setMessage(null)
    try {
      const how = await removePage(entry.slug)
      if (how === 'tombstone') setMessage('삭제했어요. (저장소가 삭제를 지원하지 않아 삭제 표시로 처리했어요)')
      onReload()
    } catch (err) {
      setMessage(`삭제하지 못했어요: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    }
  }

  const groups = useMemo(() => {
    const m = new Map<string, ScheduleIndexEntry[]>()
    for (const p of index.pages) m.set(p.star || '(스타 이름 없음)', [...(m.get(p.star || '(스타 이름 없음)') ?? []), p])
    return [...m.entries()]
  }, [index])

  return (
    <div>
      <div style={cardStyle}>
        <div style={{ ...textStyle('16/title/bold'), color: color.text.primary, margin: '0 0 4px' }}>새 일정 페이지</div>
        <p style={{ ...hint, margin: '0 0 12px' }}>스타마다 일정 페이지를 만들어요. 만든 뒤 일정과 라벨을 채우고, 링크를 복사해 메뉴나 배너에 붙여 넣으세요.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <Field label="페이지 이름">
              <input style={inputStyle} value={name} maxLength={LIMITS.name} placeholder="예: 루나 일정" onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <Field label="스타 이름">
              <input style={inputStyle} value={star} maxLength={LIMITS.star} placeholder="예: 루나" onChange={(e) => setStar(e.target.value)} />
            </Field>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <Field label="주소 이름" hintText="영문 소문자·숫자·하이픈, 30자까지. 링크에 들어가고 나중에 바꿀 수 없어요.">
              <input style={inputStyle} value={slug} maxLength={LIMITS.slug} placeholder="예: luna" onChange={(e) => setSlug(e.target.value.toLowerCase())} />
            </Field>
          </div>
        </div>
        {!slugOk && (
          <p role="alert" style={{ ...textStyle('12/body/med'), color: color.text.red, margin: '0 0 8px' }}>
            주소 이름은 영문 소문자·숫자·하이픈만 쓸 수 있고 처음과 끝은 하이픈이 아니어야 해요.
          </p>
        )}
        {taken && (
          <p role="alert" style={{ ...textStyle('12/body/med'), color: color.text.red, margin: '0 0 8px' }}>
            이미 쓰고 있는 주소 이름이에요.
          </p>
        )}
        <button type="button" style={buttonStyle('primary', busy || !isValidSlug(slug) || taken)} disabled={busy || !isValidSlug(slug) || taken} onClick={create}>
          {busy ? '만드는 중…' : '일정 페이지 만들기'}
        </button>
      </div>

      <div style={cardStyle}>
        <Field label="팬 사이트 링크 기준 주소" hintText="복사되는 링크의 앞부분이에요. 팬 사이트 주소와 다르면 고쳐 주세요(이 브라우저에 기억돼요).">
          <input
            style={inputStyle}
            value={fanBase}
            onChange={(e) => {
              setFanBase(e.target.value)
              try {
                window.localStorage.setItem(FAN_BASE_STORAGE_KEY, e.target.value)
              } catch {
                // 기억하지 못해도 화면에서는 바뀐다.
              }
            }}
          />
        </Field>
      </div>

      {message && (
        <p role="status" style={{ ...textStyle('13/body/med'), color: color.text.secondary, margin: '0 0 12px' }}>
          {message}
        </p>
      )}

      {index.pages.length === 0 && <p style={hint}>아직 일정 페이지가 없어요. 위에서 첫 페이지를 만들어 보세요.</p>}
      {groups.map(([starName, pages]) => (
        <div key={starName} style={{ marginBottom: 8 }}>
          <div style={{ ...textStyle('14/title/med'), color: color.text.primary, margin: '16px 0 8px' }}>{starName}</div>
          {pages.map((p) => (
            <div key={p.slug} style={{ ...cardStyle, marginBottom: 8, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ ...textStyle('14/title/med'), color: color.text.primary, wordBreak: 'break-word' }}>{p.name}</div>
                  <div style={{ ...textStyle('12/body/reg'), color: color.text['sub-a'] }}>
                    {p.slug} · 일정 {p.eventCount}건
                  </div>
                </div>
                <select
                  aria-label={`${p.name} 공개 범위`}
                  style={{ ...inputStyle, width: 190 }}
                  value={p.visibility}
                  onChange={(e) => changeVisibility(p, e.target.value === 'login' ? 'login' : 'public')}
                >
                  <option value="public">{VISIBILITY_LABEL.public}</option>
                  <option value="login">{VISIBILITY_LABEL.login}</option>
                </select>
                <button type="button" style={buttonStyle('secondary')} onClick={() => copyText(pageUrl(fanBase, p.slug))}>
                  링크 복사
                </button>
                <button type="button" style={buttonStyle('secondary')} onClick={() => onOpen(p.slug)}>
                  편집
                </button>
                <button type="button" style={buttonStyle('danger')} onClick={() => remove(p)}>
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── 화면 ────────────────────────────────────────────────────────────────

export default function StarScheduleSettings() {
  const [index, setIndex] = useState<ScheduleIndex | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [fanBase, setFanBase] = useState(defaultFanBase)

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    readIndex()
      .then((r) => alive && setIndex(r.index))
      .catch((err) => alive && setLoadError(err instanceof Error ? err.message : '목록을 불러오지 못했어요'))
    return () => {
      alive = false
    }
  }, [attempt])

  const reload = useCallback(() => {
    setLoadError(null)
    setAttempt((n) => n + 1)
  }, [])

  const shell: CSSProperties = { maxWidth: 880, margin: '0 auto', padding: '24px 20px 120px', boxSizing: 'border-box' }

  if (loadError)
    return (
      <div style={shell}>
        <p style={{ ...textStyle('15/body/reg'), color: color.text.red }}>{loadError}</p>
        <button type="button" style={buttonStyle('secondary')} onClick={reload}>
          다시 불러오기
        </button>
      </div>
    )
  if (!index)
    return (
      <div style={shell}>
        <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary }}>불러오는 중…</p>
      </div>
    )

  return (
    <div style={shell}>
      <h1 style={{ ...textStyle('20/title/bold'), color: color.text.primary, margin: '0 0 4px' }}>스타 일정 관리</h1>
      <p style={{ ...textStyle('13/body/reg'), color: color.text.secondary, margin: '0 0 16px' }}>
        스타마다 일정 페이지를 만들고, 공개 범위·라벨·일정을 관리해요. 팬 화면의 "스타 일정" 페이지에서 링크로 보여줘요.
      </p>
      {editing ? (
        <PageEditor
          slug={editing}
          fanBase={fanBase}
          onBack={() => {
            setEditing(null)
            reload()
          }}
          onChanged={reload}
        />
      ) : (
        <PageList index={index} fanBase={fanBase} setFanBase={setFanBase} onOpen={setEditing} onReload={reload} />
      )}
    </div>
  )
}
