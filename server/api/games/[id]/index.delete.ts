export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  if (!getGame(id)) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  await deleteGame(id)
  return { ok: true }
})
