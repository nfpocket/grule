export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  if (!getGame(id)) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  getDb().prepare('DELETE FROM chat_messages WHERE game_id = ?').run(id)
  return { ok: true }
})
