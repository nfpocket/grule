import type { SetupStep } from '#shared/types'

export default defineEventHandler((event): SetupStep[] => {
  const id = getRouterParam(event, 'id')!
  const rows = getDb()
    .prepare('SELECT id, game_id, step_no, title, body, section_ref FROM setup_steps WHERE game_id = ? ORDER BY step_no')
    .all(id) as { id: number, game_id: string, step_no: number, title: string, body: string, section_ref: string | null }[]
  return rows.map(r => ({
    id: r.id,
    gameId: r.game_id,
    stepNo: r.step_no,
    title: r.title,
    body: r.body,
    sectionRef: r.section_ref
  }))
})
