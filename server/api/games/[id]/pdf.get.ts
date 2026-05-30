import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  if (!getGame(id)) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  const path = join(gameDir(id), 'source.pdf')
  if (!existsSync(path)) throw createError({ statusCode: 404, statusMessage: 'PDF not found' })
  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', 'inline; filename="rulebook.pdf"')
  return sendStream(event, createReadStream(path))
})
