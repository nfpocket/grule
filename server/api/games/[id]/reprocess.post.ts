import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Re-runs ingestion, resuming from the first incomplete stage (skips stages whose
// output already exists). Useful after a transient failure like a provider rate-limit.
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const game = getGame(id)
  if (!game) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  if (game.status === 'processing') {
    throw createError({ statusCode: 409, statusMessage: 'This game is already processing.' })
  }
  if (!existsSync(join(gameDir(id), 'source.pdf'))) {
    throw createError({ statusCode: 400, statusMessage: 'Original PDF is missing; please re-upload.' })
  }

  runIngestion(id).catch(err => console.error('[reprocess] uncaught', err))
  return getGame(id)
})
