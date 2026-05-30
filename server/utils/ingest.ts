import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateObject } from 'ai'
import { z } from 'zod'
import { extractText, getDocumentProxy } from 'unpdf'
import type { IngestStep, StepStatus } from '#shared/types'

const splitSchema = z.object({
  game: z.object({
    title: z.string().describe('The name of the board game'),
    players: z.string().optional().describe('e.g. "2-4 players"'),
    playtime: z.string().optional().describe('e.g. "45-60 min"'),
    ages: z.string().optional().describe('e.g. "10+"'),
    summary: z.string().describe('1-2 sentence overview of the game')
  }),
  sections: z
    .array(
      z.object({
        title: z.string().describe('Human-readable section title'),
        slug: z.string().describe('short kebab-case filename slug, no extension'),
        markdown: z.string().describe('The full content of this section, formatted as clean markdown')
      })
    )
    .min(1)
    .describe('The rulebook split into logical, self-contained sections')
})

const setupSchema = z.object({
  steps: z
    .array(
      z.object({
        title: z.string().describe('Short imperative title for this setup step'),
        body: z.string().describe('Detailed markdown instructions for this step'),
        sectionRef: z.string().optional().describe('Title of the source section, if applicable')
      })
    )
    .min(1)
})

const piecesSchema = z.object({
  pieces: z
    .array(
      z.object({
        name: z.string(),
        category: z.string().optional().describe('e.g. "Cards", "Tokens", "Board"'),
        quantity: z.string().optional().describe('how many are in the box, if stated'),
        description: z.string().describe('What this component is and how it is used'),
        sectionRef: z.string().optional()
      })
    )
    .min(1)
})

const MAX_TEXT = 240_000 // safety cap on characters fed to the model

const STEP_DEFS: { key: string, label: string }[] = [
  { key: 'extract', label: 'Extract text from PDF' },
  { key: 'split', label: 'Split into sections' },
  { key: 'embed', label: 'Index & embed content' },
  { key: 'setup', label: 'Generate setup guide' },
  { key: 'pieces', label: 'Catalogue game pieces' }
]

function counts(gameId: string) {
  const db = getDb()
  const n = (sql: string) => (db.prepare(sql).get(gameId) as { n: number }).n
  return {
    sections: n('SELECT COUNT(*) n FROM sections WHERE game_id = ?'),
    chunks: n('SELECT COUNT(*) n FROM chunks WHERE game_id = ?'),
    setup: n('SELECT COUNT(*) n FROM setup_steps WHERE game_id = ?'),
    pieces: n('SELECT COUNT(*) n FROM pieces WHERE game_id = ?')
  }
}

/**
 * Runs (or resumes) the ingestion pipeline. Each stage is skipped when its
 * output already exists, so a failed run — e.g. a provider rate-limit — can be
 * retried and picks up where it left off. Progress is tracked as a structured
 * step list on the game for full transparency in the UI.
 */
export async function runIngestion(gameId: string, pdfBytes?: Uint8Array) {
  const steps: IngestStep[] = STEP_DEFS.map(s => ({ ...s, status: 'pending' as StepStatus }))
  const db = getDb()

  const persist = () => {
    setGameSteps(gameId, steps)
    const total = steps.length
    const done = steps.filter(s => s.status === 'done').length
    const active = steps.find(s => s.status === 'active')
    const errored = steps.find(s => s.status === 'error')
    updateGameProgress(gameId, {
      progress: Math.round((done / total) * 100),
      stage: errored ? `Failed: ${errored.label}` : active ? active.label : done === total ? 'Ready' : 'Queued'
    })
  }
  const set = (key: string, status: StepStatus, detail?: string) => {
    const st = steps.find(s => s.key === key)!
    st.status = status
    if (detail !== undefined) st.detail = detail
    persist()
  }
  const isDone = (key: string) => steps.find(s => s.key === key)!.status === 'done'

  // Mark already-completed stages as done (resume support)
  const c = counts(gameId)
  if (c.sections > 0) set('split', 'done', 'reused existing')
  if (c.chunks > 0) set('embed', 'done', 'reused existing')
  if (c.setup > 0) set('setup', 'done', 'reused existing')
  if (c.pieces > 0) set('pieces', 'done', 'reused existing')
  updateGameProgress(gameId, { status: 'processing', error: null })

  try {
    const settings = getSettings()
    const chat = activeChatModel()
    db.prepare('UPDATE games SET chat_provider = ?, chat_model = ? WHERE id = ?')
      .run(settings.chat.provider, settings.chat.model, gameId)

    // 1. Extract per-page text — only when a stage that consumes it (split/embed)
    // still needs to run. On a setup/pieces-only retry we skip the PDF parse entirely.
    let pages: string[] = []
    let corpus = ''
    if (!isDone('split') || !isDone('embed')) {
      set('extract', 'active')
      const bytes = pdfBytes ?? new Uint8Array(await readFile(join(gameDir(gameId), 'source.pdf')))
      const pdf = await getDocumentProxy(bytes)
      const { text } = await extractText(pdf, { mergePages: false })
      pages = (Array.isArray(text) ? text : [text]).map(t => (t || '').trim())
      const fullText = pages.join('\n\n').trim()
      if (fullText.length < 100) {
        throw new Error('Could not extract text from this PDF. It may be a scanned/image-only document.')
      }
      corpus = fullText.slice(0, MAX_TEXT)
      set('extract', 'done', `${pages.length} page${pages.length === 1 ? '' : 's'}`)
    } else {
      set('extract', 'done', 'reused existing')
    }

    // 2. Split into sections + metadata (for the reader)
    if (!isDone('split')) {
      set('split', 'active')
      const { object: split } = await generateObject({
        model: chat,
        schema: splitSchema,
        maxOutputTokens: 16000,
        system:
          'You are an expert at structuring board game rulebooks. Split the rulebook into logical, '
          + 'self-contained sections (overview, setup, gameplay/turn structure, specific rules, scoring, '
          + 'end of game, components, FAQ, etc.). Preserve all rules content faithfully and format each '
          + 'section as clean markdown. Do not invent rules.',
        prompt: `Rulebook text:\n\n${corpus}`
      })

      db.prepare('UPDATE games SET title = ?, meta = ? WHERE id = ?').run(
        split.game.title,
        JSON.stringify({
          players: split.game.players,
          playtime: split.game.playtime,
          ages: split.game.ages,
          summary: split.game.summary
        }),
        gameId
      )
      const insertSection = db.prepare(
        'INSERT INTO sections (id, game_id, ord, filename, title, content) VALUES (?, ?, ?, ?, ?, ?)'
      )
      db.prepare('DELETE FROM sections WHERE game_id = ?').run(gameId)
      for (let i = 0; i < split.sections.length; i++) {
        const s = split.sections[i]!
        const id = randomUUID()
        const filename = `${String(i + 1).padStart(2, '0')}-${slugify(s.slug || s.title)}.md`
        insertSection.run(id, gameId, i, filename, s.title, s.markdown)
        await writeFile(join(gameDir(gameId), 'sections', filename), `# ${s.title}\n\n${s.markdown}\n`, 'utf8')
      }
      set('split', 'done', `${split.sections.length} sections`)
    }

    // 3. Chunk the raw per-page text (keeps page numbers) + embed for RAG
    if (!isDone('embed')) {
      set('embed', 'active')
      const embModel = activeEmbeddingModel()
      const allChunks: { page: number, ord: number, content: string }[] = []
      pages.forEach((pageText, idx) => {
        if (!pageText) return
        for (const ch of chunkMarkdown(pageText)) {
          allChunks.push({ page: idx + 1, ord: ch.ord, content: ch.content })
        }
      })
      if (!allChunks.length) throw new Error('No text chunks to embed.')

      const embeddings = await embedTexts(embModel, allChunks.map(ch => ch.content))
      const dim = embeddings[0]?.length ?? 0
      if (!dim) throw new Error('Embedding model returned no vectors.')
      const table = ensureVecTable(dim)
      db.prepare('UPDATE games SET embedding_provider = ?, embedding_model = ?, embedding_dim = ? WHERE id = ?')
        .run(settings.embedding.provider, settings.embedding.model, dim, gameId)

      const insertChunk = db.prepare('INSERT INTO chunks (game_id, page, ord, content) VALUES (?, ?, ?, ?)')
      const insertVec = db.prepare(`INSERT INTO ${table} (chunk_id, game_id, embedding) VALUES (?, ?, ?)`)
      const store = db.transaction(() => {
        db.prepare('DELETE FROM chunks WHERE game_id = ?').run(gameId)
        db.prepare(`DELETE FROM ${table} WHERE game_id = ?`).run(gameId)
        for (let i = 0; i < allChunks.length; i++) {
          const ch = allChunks[i]!
          const res = insertChunk.run(gameId, ch.page, ch.ord, ch.content)
          // sqlite-vec needs an INTEGER-typed primary key; better-sqlite3 binds plain
          // JS numbers as FLOAT, so the rowid must be passed as a BigInt.
          insertVec.run(BigInt(res.lastInsertRowid), gameId, floatsToBlob(embeddings[i]!))
        }
      })
      store()
      set('embed', 'done', `${allChunks.length} chunks`)
    }

    // 4. Setup guide
    if (!isDone('setup')) {
      set('setup', 'active')
      await generateSetup(gameId, chat)
      set('setup', 'done')
    }

    // 5. Game pieces
    if (!isDone('pieces')) {
      set('pieces', 'active')
      await generatePieces(gameId, chat)
      set('pieces', 'done')
    }

    updateGameProgress(gameId, { status: 'ready', progress: 100, stage: 'Ready', error: null })
  } catch (err) {
    console.error('[ingest] failed for', gameId, err)
    const active = steps.find(s => s.status === 'active')
    if (active) {
      active.status = 'error'
      active.detail = describeError(err)
    }
    setGameSteps(gameId, steps)
    updateGameProgress(gameId, { status: 'error', error: describeError(err) })
  }
}

/** Extract a useful message from AI SDK errors (which hide the real cause in responseBody). */
function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string, responseBody?: string }
    const parts: string[] = []
    if (e.message) parts.push(e.message)
    if (e.responseBody) parts.push(e.responseBody)
    if (parts.length) return parts.join(' — ').slice(0, 1000)
  }
  return err instanceof Error ? err.message : String(err)
}

export async function generateSetup(gameId: string, model = activeChatModel()) {
  const db = getDb()
  const { object } = await generateObject({
    model,
    schema: setupSchema,
    maxOutputTokens: 8000,
    system:
      'You build clear, ordered, step-by-step initial setup guides for board games. Base every step '
      + 'strictly on the rulebook. Be concrete about quantities and placement. Do not invent rules.',
    prompt: `Rulebook sections:\n\n${sectionsText(gameId)}\n\nProduce the initial game setup as ordered steps.`
  })
  const insert = db.prepare(
    'INSERT INTO setup_steps (game_id, step_no, title, body, section_ref) VALUES (?, ?, ?, ?, ?)'
  )
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM setup_steps WHERE game_id = ?').run(gameId)
    object.steps.forEach((s, i) => insert.run(gameId, i + 1, s.title, s.body, s.sectionRef ?? null))
  })
  tx()
}

export async function generatePieces(gameId: string, model = activeChatModel()) {
  const db = getDb()
  const { object } = await generateObject({
    model,
    schema: piecesSchema,
    maxOutputTokens: 8000,
    system:
      'You catalogue every physical component of a board game and explain its purpose. Base everything '
      + 'strictly on the rulebook. Do not invent components.',
    prompt: `Rulebook sections:\n\n${sectionsText(gameId)}\n\nList and explain every game piece/component.`
  })
  const insert = db.prepare(
    'INSERT INTO pieces (game_id, name, category, quantity, description, section_ref) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM pieces WHERE game_id = ?').run(gameId)
    for (const p of object.pieces) {
      insert.run(gameId, p.name, p.category ?? null, p.quantity ?? null, p.description, p.sectionRef ?? null)
    }
  })
  tx()
}

function sectionsText(gameId: string): string {
  const rows = getDb()
    .prepare('SELECT title, content FROM sections WHERE game_id = ? ORDER BY ord')
    .all(gameId) as { title: string, content: string }[]
  return rows.map(r => `## ${r.title}\n${r.content}`).join('\n\n').slice(0, MAX_TEXT)
}
