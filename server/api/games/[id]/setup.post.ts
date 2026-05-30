// Regenerate the setup guide on demand.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const game = getGame(id)
  if (!game) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  await generateSetup(id)
  return { ok: true }
})
