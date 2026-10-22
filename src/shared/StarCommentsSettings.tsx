import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { color, shadow, textStyle } from '@bstage-sdk/design/admin'
import { isLocalPreview, readStoredConfig, writeStoredConfig } from './storage'
import {
  DEFAULT_CONFIG,
  LIMITS,
  PLACEMENTS,
  parseConfig,
  type PlacementKey,
  type StarCommentsConfig,
} from './starCommentsConfig'

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
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
  ordered?: boolean
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const word = draft.trim().slice(0, LIMITS.listItemLength)
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
          maxLength={LIMITS.listItemLength}
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

// 유저 화면이 설정을 어떻게 보여 줄지 대략 미리 본다(문구 · 스타 순서 · 숨김 · 링크 문구).
function Preview({ draft }: { draft: StarCommentsConfig }) {
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
  return (
    <div style={{ background: color.bg['grouped-default'], borderRadius: 12, padding: 16 }}>
      <div style={{ background: color.bg.base, borderRadius: 12, padding: 16 }}>
        <div style={{ ...textStyle('16/title/bold'), color: color.text.primary }}>{draft.title}</div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
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
    </div>
  )
}

type Status = { kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; message: string } | { kind: 'conflict' }

export default function StarCommentsSettings() {
  const [loaded, setLoaded] = useState<StarCommentsConfig | null>(null)
  const [draft, setDraft] = useState<StarCommentsConfig>(DEFAULT_CONFIG)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const local = isLocalPreview()

  const load = useCallback(() => {
    setLoaded(null)
    setLoadError(null)
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
      const result = await writeStoredConfig(clean, loaded, force)
      if (result.conflict) {
        setStatus({ kind: 'conflict' })
      } else {
        setLoaded(clean)
        setDraft(clean)
        setStatus({ kind: 'saved' })
      }
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : '저장하지 못했어요' })
    } finally {
      setSaving(false)
    }
  }

  const shell: CSSProperties = { maxWidth: 880, margin: '0 auto', padding: '24px 20px 120px', boxSizing: 'border-box' }

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
      <h1 style={{ ...textStyle('20/title/bold'), color: color.text.primary, margin: '0 0 4px' }}>스타 댓글 모아보기 설정</h1>
      <p style={{ ...textStyle('13/body/reg'), color: color.text.secondary, margin: '0 0 16px' }}>
        팬 화면의 "스타 댓글 모아보기"를 코드 수정 없이 운영해요. 저장하면 팬 화면에는 최대 10분 뒤에 반영돼요.
      </p>
      {local && (
        <p style={{ ...textStyle('13/body/med'), color: color.text.yellow, margin: '0 0 16px' }}>
          로컬 미리보기 — 어드민 로그인이 없어서 이 브라우저에만 저장돼요.
        </p>
      )}

      <Section title="노출" hint="언제, 어디에 보여줄지 정해요.">
        <Check checked={draft.enabled} onChange={(enabled) => patch({ enabled })} label="팬 화면에 노출" hint="끄면 모든 자리에서 사라져요." />
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

      <Section title="댓글 큐레이션" hint="댓글 내용에 들어 있는 글자로 골라요. 대소문자는 구분하지 않아요.">
        <div style={{ ...textStyle('13/body/med'), color: color.text.primary, marginBottom: 6 }}>맨 위에 고정할 댓글</div>
        <ListEditor
          values={draft.pinnedKeywords}
          onChange={(pinnedKeywords) => patch({ pinnedKeywords })}
          placeholder="댓글에 들어 있는 글자 (예: 이벤트 당첨)"
        />
        <div style={{ ...textStyle('13/body/med'), color: color.text.primary, margin: '16px 0 6px' }}>숨길 댓글</div>
        <ListEditor
          values={draft.hiddenKeywords}
          onChange={(hiddenKeywords) => patch({ hiddenKeywords })}
          placeholder="댓글에 들어 있는 글자 (예: 광고)"
        />
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

      <Section title="미리보기" hint="문구 · 스타 순서 · 숨김 · 링크 문구가 이렇게 보여요. 실제 댓글이 아닌 예시예요.">
        <Preview draft={clean} />
      </Section>

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
          {status.kind === 'saved' && '저장했어요. 팬 화면에는 최대 10분 뒤에 반영돼요.'}
          {status.kind === 'error' && `저장하지 못했어요: ${status.message}`}
          {status.kind === 'conflict' && '다른 운영자가 먼저 설정을 바꿨어요. 그래도 내 내용으로 저장할까요?'}
          {status.kind === 'idle' && (dirty ? '저장하지 않은 변경이 있어요.' : '변경 사항이 없어요.')}
        </span>
        {status.kind === 'conflict' && (
          <>
            <button type="button" style={buttonStyle('secondary')} onClick={load}>
              다시 불러오기
            </button>
            <button type="button" style={buttonStyle('primary', saving)} disabled={saving} onClick={() => save(true)}>
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
            <button type="button" style={buttonStyle('primary', !dirty || saving)} disabled={!dirty || saving} onClick={() => save()}>
              {saving ? '저장 중…' : '저장'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

