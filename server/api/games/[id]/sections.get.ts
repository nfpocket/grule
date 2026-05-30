import type { Section } from '#shared/types'

export default defineEventHandler((event): Section[] => {
  const id = getRouterParam(event, 'id')!
  const rows = getDb()
    .prepare('SELECT id, game_id, ord, filename, title, content FROM sections WHERE game_id = ? ORDER BY ord')
    .all(id) as { id: string, game_id: string, ord: number, filename: string, title: string, content: string }[]
  return rows.map(r => ({
    id: r.id,
    gameId: r.game_id,
    ord: r.ord,
    filename: r.filename,
    title: r.title,
    content: r.content
  }))
})
