import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { color, shadow, textStyle } from '@bstage-sdk/design/admin'
import { isLocalPreview, readStoredConfig, writeStoredConfig } from './storage'
import {
  APPLY_WAIT_MS,
  AUDIENCES,
  DEFAULT_CONFIG,
  LIMITS,
  PLACEMENTS,
  parseConfig,
  type AudienceKey,
  type PlacementKey,
  type StarCommentsConfig,
} from './starCommentsConfig'

// 왼쪽 미리보기 · 오른쪽 설정 2단 레이아웃. 좁은 화면(960px 이하)에서는 미리보기가 위로 올라가 한 줄로 쌓인다.
// Shadow DOM 안이라 <style>로 넣는다.
const LAYOUT_CSS = `
.scs-layout { display: grid; grid-template-columns: minmax(300px, 400px) minmax(0, 1fr); gap: 20px; align-items: start; }
.scs-preview { position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow: auto; }
.scs-layout--pc { grid-template-columns: minmax(0, 6fr) minmax(0, 5fr); }
@media (max-width: 960px) {
  .scs-layout { grid-template-columns: minmax(0, 1fr); }
  .scs-preview { position: static; max-height: none; overflow: visible; }
}
`

// ────────────────────────────────────────────────────────────────────────
// 스타 댓글 모아보기 — 어드민 설정 화면
// 저장 위치: custom-template-data (displayKey 'merry-star-comments'). 유저 화면이 같은 키를 읽어 반영한다.
// 스타 · 게시판 · 댓글은 어드민에서 목록을 불러올 수 없어 닉네임 · 게시판 제목 · 키워드로 지정한다.
// ────────────────────────────────────────────────────────────────────────

const inputStyle: CSSProperties = {
  ...textStyle('15/body/reg'),
  width: '100%',
  boxSizing: 'border-box',
  height: 40,
  padding: '0 12px',
  borderRadius: 8,
  border: `1px solid ${color.border['default-a']}`,
  background: color.bg.base,
  color: color.text.primary,
}

const cardStyle: CSSProperties = {
  background: color.bg.base,
  border: `1px solid ${color.border['divider-a']}`,
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
}

function buttonStyle(kind: 'primary' | 'secondary' | 'ghost', disabled = false): CSSProperties {
  return {
    ...textStyle('14/title/med'),
    height: 40,
    padding: '0 16px',
    borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    border: kind === 'primary' ? 'none' : `1px solid ${color.border['default-a']}`,
    background: kind === 'primary' ? color.surface['form-bstage'] : kind === 'ghost' ? 'transparent' : color.bg.base,
    color: kind === 'primary' ? color.bg.base : color.text.primary,
    whiteSpace: 'nowrap',
  }
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section style={cardStyle}>
      <h2 style={{ ...textStyle('16/title/bold'), color: color.text.primary, margin: '0 0 4px' }}>{title}</h2>
      {hint && <p style={{ ...textStyle('13/body/reg'), color: color.text.secondary, margin: '0 0 16px' }}>{hint}</p>}
      {!hint && <div style={{ height: 12 }} />}
      {children}
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ ...textStyle('13/body/med'), color: color.text.primary, display: 'block', marginBottom: 6 }}>{label}</span>
      {children}
      {hint && <span style={{ ...textStyle('12/body/reg'), color: color.text['sub-a'], display: 'block', marginTop: 4 }}>{hint}</span>}
    </label>
  )
}

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: (next: boolean) => void; label: string; hint?: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, marginTop: 2, accentColor: 'currentColor', cursor: 'pointer' }}
      />
      <span>
        <span style={{ ...textStyle('14/title/med'), color: color.text.primary, display: 'block' }}>{label}</span>
        {hint && <span style={{ ...textStyle('12/body/reg'), color: color.text['sub-a'], display: 'block' }}>{hint}</span>}
      </span>
    </label>
  )
}

// 문자열 목록 편집기 — 입력 후 Enter/추가. ordered면 ▲▼로 순서를 바꾼다.
function ListEditor({
  values,
  onChange,
  placeholder,
  ordered = false,
  maxLength = LIMITS.listItemLength,
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
  ordered?: boolean
  maxLength?: number
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const word = draft.trim().slice(0, maxLength)
    if (!word || values.includes(word) || values.length >= LIMITS.listItems) return
    onChange([...values, word])
    setDraft('')
  }
  const move = (index: number, delta: number) => {
    const next = [...values]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  const smallButton: CSSProperties = {
    ...textStyle('12/body/med'),
    height: 28,
    minWidth: 28,
    padding: '0 8px',
    borderRadius: 6,
    border: `1px solid ${color.border['default-a']}`,
    background: color.bg.base,
    color: color.text.primary,
    cursor: 'pointer',
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={draft}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          style={inputStyle}
        />
        <button type="button" onClick={add} style={buttonStyle('secondary', !draft.trim())} disabled={!draft.trim()}>
          추가
        </button>
      </div>
      {values.length === 0 ? (
        <p style={{ ...textStyle('12/body/reg'), color: color.text['sub-a'], margin: '8px 0 0' }}>아직 없어요.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {values.map((value, index) => (
            <li
              key={value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 8,
                background: color.bg['grouped-default'],
              }}
            >
              {ordered && <span style={{ ...textStyle('12/body/bold'), color: color.text['sub-a'], width: 18 }}>{index + 1}</span>}
              <span style={{ ...textStyle('14/title/med'), color: color.text.primary, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                {value}
              </span>
              {ordered && (
                <>
                  <button type="button" aria-label="위로" style={smallButton} onClick={() => move(index, -1)} disabled={index === 0}>
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label="아래로"
                    style={smallButton}
                    onClick={() => move(index, 1)}
                    disabled={index === values.length - 1}
                  >
                    ▼
                  </button>
                </>
              )}
              <button type="button" aria-label={`${value} 삭제`} style={smallButton} onClick={() => onChange(values.filter((v) => v !== value))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const SAMPLE_COMMENTS = [
  { nickname: '메리', body: '이곳에 온 걸 환영해요', kind: 'contents' as const, title: '오픈 안내', time: '2시간 전' },
  { nickname: 'Gini', body: '저는 인도 사람인데요 여기서 뭐하고 있을까요', kind: 'story' as const, title: '피아니스트가 된 고은혁?', time: '1시간 전' },
  { nickname: '애뤼애나', body: '팬 여러분 감사해요!', kind: 'community' as const, title: 'To. 애뤼애나', time: '방금 전' },
]

// 어떤 댓글을 모으는지 한 줄 요약(미리보기 위쪽에 보여 준다).
function curationSummary(draft: StarCommentsConfig): string {
  const parts: string[] = []
  if (draft.tagFilter.enabled) parts.push(`태그 ${draft.tagFilter.tags.map((t) => `#${t}`).join(' ')}`)
  else parts.push('전체 글')
  if (draft.perPostLimit > 0) parts.push(`글당 ${draft.perPostLimit}개(${draft.perPostOrder === 'reactions' ? '반응 많은 순' : '최신'})`)
  if (draft.minReactions > 0) parts.push(`반응 ${draft.minReactions}개 이상`)
  return parts.join(' · ')
}

type PreviewDevice = 'mobile' | 'pc'
// 모바일은 좁은 폭(360px)에 1열, PC는 칸을 꽉 채워 2열로 보여 준다.
const MOBILE_PREVIEW_WIDTH = 360

function MobileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </svg>
  )
}

function PcIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8.5 21h7M12 17v4" />
    </svg>
  )
}

// 모바일 · PC 전환 버튼
function DeviceToggle({ value, onChange }: { value: PreviewDevice; onChange: (next: PreviewDevice) => void }) {
  const options: { key: PreviewDevice; label: string; icon: ReactNode }[] = [
    { key: 'mobile', label: '모바일 보기', icon: <MobileIcon /> },
    { key: 'pc', label: 'PC 보기', icon: <PcIcon /> },
  ]
  return (
    <div role="group" aria-label="미리보기 화면 크기" style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 10, background: color.bg['grouped-default'] }}>
      {options.map(({ key, label, icon }) => {
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={() => onChange(key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 32,
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              background: active ? color.bg.base : 'transparent',
              boxShadow: active ? shadow['default-small'] : 'none',
              color: active ? color.text.primary : color.text['sub-a'],
            }}
          >
            {icon}
          </button>
        )
      })}
    </div>
  )
}

// 유저 화면이 설정을 어떻게 보여 줄지 대략 미리 본다(문구 · 스타 순서 · 숨김 · 링크 문구).
function Preview({ draft, device }: { draft: StarCommentsConfig; device: PreviewDevice }) {
  const rank = (nickname: string) => {
    const index = draft.starOrder.indexOf(nickname)
    return index === -1 ? draft.starOrder.length : index
  }
  const stars = ['메리', 'Gini', '애뤼애나'].filter((n) => !draft.hiddenStars.includes(n)).sort((a, b) => rank(a) - rank(b))
  const cards = SAMPLE_COMMENTS.filter(
    (c) => !draft.hiddenStars.includes(c.nickname) && draft.sources[c.kind] && !draft.hiddenKeywords.some((w) => w && c.body.includes(w))
  )
  const chip = (active = false): CSSProperties => ({
    ...textStyle('12/body/med'),
    padding: '5px 10px',
    borderRadius: 999,
    background: active ? color.text.primary : color.bg['grouped-default'],
    color: active ? color.bg.base : color.text.primary,
  })
  const audience = AUDIENCES.find((a) => a.key === draft.audience)
  const placementsOn = PLACEMENTS.filter((p) => draft.placements[p.key]).map((p) => p.label)
  const period = draft.startDate || draft.endDate ? `${draft.startDate ?? '처음'} ~ ${draft.endDate ?? '계속'}` : '항상'
  const summary: [string, string][] = [
    ['상태', draft.enabled ? '노출 중' : '꺼짐 — 팬 화면에 안 보여요'],
    ['기간', period],
    ['대상', audience?.label ?? '전체 공개'],
    ['스위치', draft.showToggle ? '보여주기' : '숨기기'],
    ['자리', placementsOn.length ? placementsOn.join(' · ') : '켜진 자리가 없어요'],
    ['기준', curationSummary(draft)],
  ]
  const pc = device === 'pc'
  const screen = (
    <div style={{ background: color.bg.base, borderRadius: 12, padding: pc ? 24 : 16, border: `1px solid ${color.border['divider-a']}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ ...textStyle('16/title/bold'), color: color.text.primary }}>{draft.title}</div>
          {draft.showToggle && (
            <span
              aria-label="켜기/끄기 스위치(미리보기)"
              style={{ flexShrink: 0, width: 36, height: 20, padding: 2, boxSizing: 'border-box', borderRadius: 999, background: color.text.primary, display: 'flex', justifyContent: 'flex-end' }}
            >
              <span style={{ width: 16, height: 16, borderRadius: 999, background: color.bg.base }} />
            </span>
          )}
        </div>
        {draft.subtitle && <div style={{ ...textStyle('13/body/reg'), color: color.text.secondary, marginTop: 2 }}>{draft.subtitle}</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
          <span style={chip(true)}>전체 스타</span>
          {stars.map((name) => (
            <span key={name} style={chip()}>
              {name}
            </span>
          ))}
        </div>
        {cards.length === 0 ? (
          <div style={{ ...textStyle('13/body/reg'), color: color.text.secondary }}>{draft.emptyText}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: pc ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 10 }}>
            {cards.map((c) => (
              <div key={c.nickname} style={{ border: `1px solid ${color.border['divider-a']}`, borderRadius: 10, padding: 12, boxShadow: shadow['default-small'] }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ ...textStyle('13/body/bold'), color: color.text.primary }}>{c.nickname}</span>
                  <span style={{ ...textStyle('12/body/reg'), color: color.text['sub-a'] }}>{c.time}</span>
                </div>
                <div style={{ ...textStyle('13/body/reg'), color: color.text.primary, margin: '6px 0 8px' }}>{c.body}</div>
                <div style={{ ...textStyle('12/body/reg'), color: color.text.secondary, background: color.bg['grouped-default'], borderRadius: 6, padding: '6px 8px', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{c.title}</span>
                  <span style={{ ...textStyle('12/body/bold'), color: color.text.primary }}>{draft.linkLabels[c.kind]} ›</span>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
  return (
    <div style={{ background: color.bg['grouped-default'], borderRadius: 12, padding: 16 }}>
      <dl style={{ margin: '0 0 12px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
        {summary.map(([label, value]) => (
          <div key={label} style={{ display: 'contents' }}>
            <dt style={{ ...textStyle('12/body/bold'), color: color.text['sub-a'] }}>{label}</dt>
            <dd style={{ ...textStyle('12/body/med'), color: color.text.primary, margin: 0, overflowWrap: 'anywhere' }}>{value}</dd>
          </div>
        ))}
      </dl>
      <div style={{ maxWidth: pc ? undefined : MOBILE_PREVIEW_WIDTH, margin: '0 auto' }}>{screen}</div>
    </div>
  )
}

type Status =
  | { kind: 'idle' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string }
  | { kind: 'conflict'; by?: string | null; at?: string | null }

// 어드민 페이지 템플릿에는 "지금 로그인한 운영자"를 알려 주는 통로가 없어서, 저장하는 사람이 이름을 한 번 적으면
// 이 브라우저에 기억해 두었다가 저장할 때마다 이름과 시각을 설정에 같이 남긴다.
const EDITOR_STORAGE_KEY = 'merry-star-comments-editor'

function readEditorName(): string {
  try {
    return (window.localStorage.getItem(EDITOR_STORAGE_KEY) ?? '').slice(0, LIMITS.editorName)
  } catch {
    return ''
  }
}

function formatKst(iso: string): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
  return `${parts} (KST)`
}

// 저장 뒤 팬 화면에 닿을 때까지의 로딩. 어드민은 팬 쪽 캐시를 직접 볼 수 없어서
// 저장 시각부터 APPLY_WAIT_MS(팬 화면이 설정을 새로 읽는 주기 + 여유)를 기다린 뒤 "반영 완료"로 바뀐다.
function ApplyProgress({ savedAt }: { savedAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  const elapsed = now - savedAt
  const done = elapsed >= APPLY_WAIT_MS
  useEffect(() => {
    if (done) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [done])
  const ratio = Math.min(1, Math.max(0, elapsed / APPLY_WAIT_MS))
  const remain = Math.max(1, Math.ceil((APPLY_WAIT_MS - elapsed) / 1000))
  return (
    <span role="status" aria-live="polite" style={{ display: 'block' }}>
      <span style={{ display: 'block', color: done ? color.text.primary : color.text.secondary }}>
        {done ? '✓ 반영 완료 — 이제 팬 화면에서 확인할 수 있어요.' : `저장했어요. 팬 화면에 반영하는 중… 약 ${remain}초 남았어요.`}
      </span>
      <span style={{ display: 'block', height: 4, borderRadius: 2, background: color.bg['grouped-default'], marginTop: 6, overflow: 'hidden' }}>
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${ratio * 100}%`,
            background: color.surface['form-bstage'],
            transition: 'width 0.5s linear',
          }}
        />
      </span>
    </span>
  )
}

export default function StarCommentsSettings() {
  const [loaded, setLoaded] = useState<StarCommentsConfig | null>(null)
  const [draft, setDraft] = useState<StarCommentsConfig>(DEFAULT_CONFIG)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('mobile')
  const [editor, setEditor] = useState(readEditorName)
  const local = isLocalPreview()

  const load = useCallback(() => {
    setLoaded(null)
    setLoadError(null)
    // 다시 불러오면 충돌 안내도 걷어 낸다(안 그러면 최신 값을 불러온 뒤에도 "덮어쓰기" 안내가 남는다).
    setStatus({ kind: 'idle' })
    readStoredConfig()
      .then((stored) => {
        setLoaded(stored.config)
        setDraft(stored.config)
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : '설정을 불러오지 못했어요'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const clean = useMemo(() => parseConfig(draft), [draft])
  const dirty = loaded !== null && JSON.stringify(clean) !== JSON.stringify(loaded)
  const patch = (partial: Partial<StarCommentsConfig>) => {
    setStatus({ kind: 'idle' })
    setDraft((prev) => ({ ...prev, ...partial }))
  }

  const save = async (force = false) => {
    if (!loaded) return
    setSaving(true)
    setStatus({ kind: 'idle' })
    try {
      // 저장하는 사람과 시각을 설정에 같이 남긴다.
      const next = parseConfig({ ...clean, updatedBy: editor.trim(), updatedAt: new Date().toISOString() })
      const result = await writeStoredConfig(next, loaded, force)
      if (result.conflict) {
        setStatus({ kind: 'conflict', by: result.by, at: result.at })
      } else {
        try {
          window.localStorage.setItem(EDITOR_STORAGE_KEY, next.updatedBy ?? '')
        } catch {
          // 저장소를 못 써도 저장 자체에는 영향이 없다.
        }
        setLoaded(next)
        setDraft(next)
        setStatus({ kind: 'saved', at: Date.now() })
      }
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : '저장하지 못했어요' })
    } finally {
      setSaving(false)
    }
  }

  const shell: CSSProperties = { maxWidth: 1240, margin: '0 auto', padding: '24px 20px 120px', boxSizing: 'border-box' }

  if (loadError) {
    return (
      <div style={shell}>
        <p style={{ ...textStyle('15/body/reg'), color: color.text.red }}>{loadError}</p>
        <button type="button" style={buttonStyle('secondary')} onClick={load}>
          다시 불러오기
        </button>
      </div>
    )
  }
  if (!loaded) {
    return (
      <div style={shell}>
        <p style={{ ...textStyle('15/body/reg'), color: color.text.secondary }}>설정을 불러오는 중…</p>
      </div>
    )
  }

  return (
    <div style={shell}>
      <style>{LAYOUT_CSS}</style>
      <h1 style={{ ...textStyle('20/title/bold'), color: color.text.primary, margin: '0 0 4px' }}>스타 댓글 모아보기 설정</h1>
      <p style={{ ...textStyle('13/body/reg'), color: color.text.secondary, margin: '0 0 6px' }}>
        팬 화면의 "스타 댓글 모아보기"를 코드 수정 없이 운영해요. 저장하면 1분 안에 팬 화면에 반영되고, 반영이 끝나면 알려 드려요.
      </p>
      <p data-testid="last-edited" style={{ ...textStyle('13/body/med'), color: color.text['sub-a'], margin: '0 0 16px' }}>
        {loaded.updatedAt
          ? `마지막 수정: ${loaded.updatedBy ?? '이름 없음'} · ${formatKst(loaded.updatedAt)}`
          : '마지막 수정: 기록 없음 (수정자 기록 기능 이전에 저장됐거나 아직 저장한 적이 없어요)'}
      </p>
      {local && (
        <p style={{ ...textStyle('13/body/med'), color: color.text.yellow, margin: '0 0 16px' }}>
          로컬 미리보기 — 어드민 로그인이 없어서 이 브라우저에만 저장돼요.
        </p>
      )}

      <div className={previewDevice === 'pc' ? 'scs-layout scs-layout--pc' : 'scs-layout'}>
      {/* 왼쪽: 미리보기 */}
      <aside className="scs-preview">
        <section style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
            <h2 style={{ ...textStyle('16/title/bold'), color: color.text.primary, margin: 0 }}>미리보기</h2>
            <DeviceToggle value={previewDevice} onChange={setPreviewDevice} />
          </div>
          <p style={{ ...textStyle('13/body/reg'), color: color.text.secondary, margin: '0 0 12px' }}>
            문구 · 스타 순서 · 숨김 · 링크 문구가 이렇게 보여요. 실제 댓글이 아닌 예시예요.
          </p>
          <Preview draft={clean} device={previewDevice} />
        </section>
      </aside>

      {/* 오른쪽: 설정 */}
      <div style={{ minWidth: 0 }}>
      <Section title="노출" hint="언제, 어디에, 누구에게 보여줄지 정해요.">
        <Check checked={draft.enabled} onChange={(enabled) => patch({ enabled })} label="팬 화면에 노출" hint="끄면 모든 자리에서 사라져요." />
        <div style={{ ...textStyle('13/body/med'), color: color.text.primary, margin: '14px 0 2px' }}>방문자용 켜기/끄기 스위치</div>
        {(
          [
            [true, '보여주기', '제목 옆 스위치로 방문자가 이 목록을 접고 펼 수 있어요.'],
            [false, '숨기기', '스위치 없이 항상 목록을 보여줘요. 예전에 스위치를 꺼 둔 방문자에게도 다시 보여요.'],
          ] as const
        ).map(([value, label, hint]) => (
          <label key={String(value)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
            <input
              type="radio"
              name="scs-show-toggle"
              checked={draft.showToggle === value}
              onChange={() => patch({ showToggle: value })}
              style={{ width: 18, height: 18, marginTop: 2, accentColor: 'currentColor', cursor: 'pointer' }}
            />
            <span>
              <span style={{ ...textStyle('14/title/med'), color: color.text.primary, display: 'block' }}>{label}</span>
              <span style={{ ...textStyle('12/body/reg'), color: color.text['sub-a'], display: 'block' }}>{hint}</span>
            </span>
          </label>
        ))}
        <div style={{ ...textStyle('13/body/med'), color: color.text.primary, margin: '14px 0 2px' }}>누구에게 보여줄까요</div>
        {AUDIENCES.map(({ key, label, available }) => (
          <label
            key={key}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '6px 0',
              cursor: available ? 'pointer' : 'not-allowed',
              opacity: available ? 1 : 0.55,
            }}
          >
            <input
              type="radio"
              name="star-comments-audience"
              checked={draft.audience === key}
              disabled={!available}
              onChange={() => patch({ audience: key as AudienceKey })}
              style={{ width: 18, height: 18, marginTop: 2, cursor: 'inherit' }}
            />
            <span>
              <span style={{ ...textStyle('14/title/med'), color: color.text.primary }}>{label}</span>
              {!available && (
                <span style={{ ...textStyle('12/body/med'), color: color.text.red, marginLeft: 8 }}>지금은 사용할 수 없어요</span>
              )}
              {key === 'login' && (
                <span style={{ ...textStyle('12/body/reg'), color: color.text['sub-a'], display: 'block' }}>
                  로그인하지 않은 방문자에게는 위젯이 안 보여요. (화면에서만 가리는 것이고 댓글 자체를 숨기는 보안 장치는 아니에요.)
                </span>
              )}
            </span>
          </label>
        ))}
        <p style={{ ...textStyle('12/body/reg'), color: color.text['sub-a'], margin: '4px 0 12px' }}>
          멤버십 가입자·POP 구독자는 가입 여부를 알려 주는 플랫폼 API가 아직 없어서 선택할 수 없어요. API가 열리면 연결할 수 있게 자리만 만들어 두었어요.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0 4px' }}>
          <div style={{ flex: '1 1 180px' }}>
            <Field label="노출 시작일" hint="비우면 바로 노출 (한국 시간)">
              <input type="date" style={inputStyle} value={draft.startDate ?? ''} onChange={(e) => patch({ startDate: e.target.value || null })} />
            </Field>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <Field label="노출 종료일" hint="비우면 계속 노출 (종료일 23:59까지)">
              <input type="date" style={inputStyle} value={draft.endDate ?? ''} onChange={(e) => patch({ endDate: e.target.value || null })} />
            </Field>
          </div>
        </div>
        <div style={{ ...textStyle('13/body/med'), color: color.text.primary, margin: '8px 0 2px' }}>어디에 보여줄까요</div>
        {PLACEMENTS.map(({ key, label }) => (
          <Check
            key={key}
            checked={draft.placements[key]}
            onChange={(checked) => patch({ placements: { ...draft.placements, [key as PlacementKey]: checked } })}
            label={label}
          />
        ))}
        <p style={{ ...textStyle('12/body/reg'), color: color.text['sub-a'], margin: '6px 0 0' }}>
          포털에 등록·게시된 자리만 실제로 보여요. 체크를 꺼도 위젯은 남아 있고 화면에서만 사라져요.
        </p>
      </Section>

      <Section title="문구" hint="팬 화면에 보이는 글자를 바꿔요. 비우면 기본 문구를 써요.">
        <Field label="제목">
          <input style={inputStyle} maxLength={LIMITS.title} value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
        </Field>
        <Field label="부제" hint="비우면 부제 없이 보여요.">
          <input style={inputStyle} maxLength={LIMITS.subtitle} value={draft.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} />
        </Field>
        <Field label="댓글이 없을 때 문구">
          <input style={inputStyle} maxLength={LIMITS.emptyText} value={draft.emptyText} onChange={(e) => patch({ emptyText: e.target.value })} />
        </Field>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {(
            [
              ['contents', '콘텐츠 링크 문구'],
              ['story', '스타 스토리 링크 문구'],
              ['community', '커뮤니티 링크 문구'],
            ] as const
          ).map(([kind, label]) => (
            <div key={kind} style={{ flex: '1 1 200px' }}>
              <Field label={label}>
                <input
                  style={inputStyle}
                  maxLength={LIMITS.linkLabel}
                  value={draft.linkLabels[kind]}
                  onChange={(e) => patch({ linkLabels: { ...draft.linkLabels, [kind]: e.target.value } })}
                />
              </Field>
            </div>
          ))}
        </div>
      </Section>

      <Section title="모을 댓글" hint="어디의 스타 댓글을 모을지 정해요.">
        <Check checked={draft.sources.contents} onChange={(v) => patch({ sources: { ...draft.sources, contents: v } })} label="콘텐츠" />
        <Check checked={draft.sources.story} onChange={(v) => patch({ sources: { ...draft.sources, story: v } })} label="스타 스토리" />
        <Check checked={draft.sources.community} onChange={(v) => patch({ sources: { ...draft.sources, community: v } })} label="커뮤니티" />
        <div style={{ ...textStyle('13/body/med'), color: color.text.primary, margin: '14px 0 6px' }}>제외할 커뮤니티 게시판</div>
        <ListEditor
          values={draft.excludedBoards}
          onChange={(excludedBoards) => patch({ excludedBoards })}
          placeholder="게시판 제목 (예: 공지사항)"
        />
      </Section>

      <Section title="스타" hint="스타는 닉네임으로 지정해요. 칩 순서와 숨김에 쓰여요.">
        <div style={{ ...textStyle('13/body/med'), color: color.text.primary, marginBottom: 6 }}>앞에 보여줄 스타 (위가 먼저)</div>
        <ListEditor values={draft.starOrder} onChange={(starOrder) => patch({ starOrder })} placeholder="스타 닉네임" ordered />
        <div style={{ ...textStyle('13/body/med'), color: color.text.primary, margin: '16px 0 6px' }}>숨길 스타</div>
        <ListEditor values={draft.hiddenStars} onChange={(hiddenStars) => patch({ hiddenStars })} placeholder="스타 닉네임" />
      </Section>

      <Section title="댓글 큐레이션" hint="어떤 글의 스타 댓글을 어떻게 골라 보여줄지 정해요.">
        <Check
          checked={draft.tagFilter.enabled}
          onChange={(enabled) => patch({ tagFilter: { ...draft.tagFilter, enabled } })}
          label="태그가 붙은 글의 댓글만 보여주기"
          hint="어드민에서 글에 붙인 태그로 골라요. 콘텐츠 · 스타 스토리 글에만 적용되고, 켜면 태그가 없는 커뮤니티 댓글은 빠져요."
        />
        <div style={{ margin: '8px 0 0' }}>
          <ListEditor
            values={draft.tagFilter.tags}
            onChange={(tags) => patch({ tagFilter: { ...draft.tagFilter, tags } })}
            placeholder="태그 이름 (예: 스타픽, # 없이)"
          />
          <p style={{ ...textStyle('12/body/reg'), color: color.text['sub-a'], margin: '6px 0 0' }}>
            태그를 하나도 넣지 않으면 꺼진 것으로 봐요. 태그가 여러 개면 그중 하나라도 붙은 글을 보여줘요.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '20px 0 0' }}>
          <div style={{ flex: '1 1 200px' }}>
            <Field label="글 하나당 보여줄 댓글" hint="한 글에 스타 댓글이 여러 개일 때 대표만 남겨요.">
              <select
                style={inputStyle}
                value={draft.perPostLimit}
                onChange={(e) => patch({ perPostLimit: Number(e.target.value) })}
              >
                <option value={0}>제한 없음</option>
                {[1, 2, 3, 5].map((n) => (
                  <option key={n} value={n}>
                    최대 {n}개
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <Field label="고르는 기준" hint="최대 개수가 정해졌을 때만 쓰여요.">
              <select
                style={inputStyle}
                value={draft.perPostOrder}
                disabled={draft.perPostLimit === 0}
                onChange={(e) => patch({ perPostOrder: e.target.value === 'reactions' ? 'reactions' : 'latest' })}
              >
                <option value="latest">최신 댓글</option>
                <option value="reactions">반응 많은 댓글</option>
              </select>
            </Field>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <Field label="최소 반응 수" hint="0이면 제한 없음. 스타 답글은 반응 수를 몰라 0으로 봐요.">
              <input
                type="number"
                style={inputStyle}
                min={0}
                max={LIMITS.minReactionsMax}
                value={draft.minReactions}
                onChange={(e) => patch({ minReactions: Math.max(0, Math.round(Number(e.target.value)) || 0) })}
              />
            </Field>
          </div>
        </div>

        <div style={{ ...textStyle('13/body/med'), color: color.text.primary, margin: '8px 0 6px' }}>맨 위에 고정할 댓글</div>
        <ListEditor
          values={draft.pinnedKeywords}
          onChange={(pinnedKeywords) => patch({ pinnedKeywords })}
          placeholder="댓글에 들어 있는 글자 (예: 이벤트 당첨)"
        />
        <div style={{ ...textStyle('13/body/med'), color: color.text.primary, margin: '16px 0 6px' }}>금칙어 (이 글자가 들어 있으면 숨겨요)</div>
        <ListEditor
          values={draft.hiddenKeywords}
          onChange={(hiddenKeywords) => patch({ hiddenKeywords })}
          placeholder="댓글에 들어 있는 글자 (예: 광고)"
        />
        <div style={{ ...textStyle('13/body/med'), color: color.text.primary, margin: '16px 0 2px' }}>숨길 댓글 ID</div>
        <p style={{ ...textStyle('12/body/reg'), color: color.text['sub-a'], margin: '0 0 6px' }}>
          태그가 붙은 글 안에서 딱 한두 개만 빼고 싶을 때 써요. 댓글 ID는 팬 화면 주소 끝에 ?curate=1 을 붙이면 카드마다 보이는 "ID 복사" 버튼으로 가져와요.
        </p>
        <ListEditor
          values={draft.hiddenCommentIds}
          onChange={(hiddenCommentIds) => patch({ hiddenCommentIds })}
          placeholder="댓글 ID"
          maxLength={LIMITS.commentIdLength}
        />
        <p style={{ ...textStyle('12/body/reg'), color: color.text['sub-a'], margin: '12px 0 0' }}>
          글자로 찾는 항목은 대소문자를 구분하지 않아요.
        </p>
      </Section>

      <Section title="목록">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <Field label="기본 정렬">
              <select
                style={inputStyle}
                value={draft.defaultSort}
                onChange={(e) => patch({ defaultSort: e.target.value === 'reactions' ? 'reactions' : 'latest' })}
              >
                <option value="latest">최신순</option>
                <option value="reactions">반응 많은 순</option>
              </select>
            </Field>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <Field label="한 번에 보여줄 개수" hint={`${LIMITS.pageSizeMin}~${LIMITS.pageSizeMax}개 (3열 화면에서 줄이 맞게 3의 배수 추천)`}>
              <input
                type="number"
                style={inputStyle}
                min={LIMITS.pageSizeMin}
                max={LIMITS.pageSizeMax}
                value={draft.pageSize}
                onChange={(e) => patch({ pageSize: Number(e.target.value) || DEFAULT_CONFIG.pageSize })}
              />
            </Field>
          </div>
        </div>
      </Section>

      </div>
      </div>

      {/* 저장 바 */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          marginTop: 8,
          padding: '12px 16px',
          background: color.bg.base,
          border: `1px solid ${color.border['default-a']}`,
          borderRadius: 12,
          boxShadow: shadow['default-large'],
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ ...textStyle('13/body/med'), color: status.kind === 'error' || status.kind === 'conflict' ? color.text.red : color.text.secondary, flex: 1, minWidth: 180 }}>
          {status.kind === 'saved' && <ApplyProgress savedAt={status.at} />}
          {status.kind === 'error' && `저장하지 못했어요: ${status.message}`}
          {status.kind === 'conflict' &&
            `${status.by && status.at ? `${status.by}님이 ${formatKst(status.at)}에` : '다른 운영자가'} 먼저 설정을 바꿨어요. 그래도 내 내용으로 저장할까요?`}
          {status.kind === 'idle' &&
            (dirty ? (editor.trim() ? '저장하지 않은 변경이 있어요.' : '저장하려면 수정자 이름을 적어 주세요.') : '변경 사항이 없어요.')}
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ ...textStyle('12/body/med'), color: color.text['sub-a'], whiteSpace: 'nowrap' }}>수정자</span>
          <input
            aria-label="수정자 이름"
            value={editor}
            maxLength={LIMITS.editorName}
            placeholder="이름"
            onChange={(e) => setEditor(e.target.value)}
            style={{ ...inputStyle, width: 120, height: 36 }}
          />
        </label>
        {status.kind === 'conflict' && (
          <>
            <button type="button" style={buttonStyle('secondary')} onClick={load}>
              다시 불러오기
            </button>
            <button
              type="button"
              style={buttonStyle('primary', saving || !editor.trim())}
              disabled={saving || !editor.trim()}
              onClick={() => save(true)}
            >
              덮어쓰기
            </button>
          </>
        )}
        {status.kind !== 'conflict' && (
          <>
            <button
              type="button"
              style={buttonStyle('ghost', !dirty || saving)}
              disabled={!dirty || saving}
              onClick={() => {
                setDraft(loaded)
                setStatus({ kind: 'idle' })
              }}
            >
              되돌리기
            </button>
            <button
              type="button"
              style={buttonStyle('primary', !dirty || saving || !editor.trim())}
              disabled={!dirty || saving || !editor.trim()}
              onClick={() => save()}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

