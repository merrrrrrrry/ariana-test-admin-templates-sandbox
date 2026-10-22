import { createTemplate } from '@bstage-sdk/react'
import { color } from '@bstage-sdk/design/admin'
import StarCommentsSettings from '../../shared/StarCommentsSettings'

// 어드민 설정 화면 — 팬 화면(유저 레포 ariana-test-custom-templates-sandbox)의 "스타 댓글 모아보기"를
// 코드 수정 없이 운영한다. 저장은 custom-template-data(displayKey merry-star-comments).
// 메뉴 위치는 코드가 아니라 포털 페이지 설정의 GNB 메뉴에서 정한다.
export default function StarCommentsSettingsPage() {
  return (
    <div style={{ minHeight: '100vh', background: color.bg['grouped-default'] }}>
      <StarCommentsSettings />
    </div>
  )
}

createTemplate(StarCommentsSettingsPage, {
  name: 'star-comments-settings',
})
