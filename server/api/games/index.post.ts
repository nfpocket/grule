import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'file' && p.filename)
  if (!file) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded (expected field "file").' })
  }
  const isPdf = file.type === 'application/pdf' || file.filename?.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    throw createError({ statusCode: 400, statusMessage: 'Only PDF files are supported.' })
  }

  const id = randomUUID()
  const title = (file.filename || 'Untitled game').replace(/\.pdf$/i, '')
  const pdfPath = join(gameDir(id), 'source.pdf')
  await writeFile(pdfPath, file.data)

  const db = getDb()
  db.prepare(
    `INSERT INTO games (id, title, slug, status, stage, progress, pdf_path, created_at)
     VALUES (?, ?, ?, 'processing', 'Queued', 0, ?, ?)`
  ).run(id, title, slugify(title), pdfPath, Date.now())

  // Kick off ingestion in the background (local Node process keeps running).
  const bytes = new Uint8Array(file.data)
  runIngestion(id, bytes).catch(err => console.error('[ingest] uncaught', err))

  return getGame(id)
})
