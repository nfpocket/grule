import type { Piece } from '#shared/types'

export default defineEventHandler((event): Piece[] => {
  const id = getRouterParam(event, 'id')!
  const rows = getDb()
    .prepare('SELECT id, game_id, name, category, quantity, description, section_ref FROM pieces WHERE game_id = ? ORDER BY id')
    .all(id) as { id: number, game_id: string, name: string, category: string | null, quantity: string | null, description: string, section_ref: string | null }[]
  return rows.map(r => ({
    id: r.id,
    gameId: r.game_id,
    name: r.name,
    category: r.category,
    quantity: r.quantity,
    description: r.description,
    sectionRef: r.section_ref
  }))
})
