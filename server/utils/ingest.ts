import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateObject } from 'ai'
import { z } from 'zod'
import { extractText, getDocumentProxy } from 'unpdf'

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

export async function runIngestion(gameId: string, pdfBytes: Uint8Array) {
  try {
    const settings = getSettings()
    const chat = activeChatModel()
    const embModel = activeEmbeddingModel()
    const db = getDb()

    db.prepare(
      `UPDATE games SET chat_provider = ?, chat_model = ?, embedding_provider = ?, embedding_model = ?
       WHERE id = ?`
    ).run(settings.chat.provider, settings.chat.model, settings.embedding.provider, settings.embedding.model, gameId)

    // 1. Extract text
    updateGameProgress(gameId, { stage: 'Extracting text from PDF', progress: 10 })
    const pdf = await getDocumentProxy(pdfBytes)
    const { text } = await extractText(pdf, { mergePages: true })
    const fullText = (Array.isArray(text) ? text.join('\n\n') : text).trim()
    if (fullText.length < 100) {
      throw new Error('Could not extract text from this PDF. It may be a scanned/image-only document.')
    }
    const corpus = fullText.slice(0, MAX_TEXT)

    // 2. Split into sections + extract metadata
    updateGameProgress(gameId, { stage: 'Analyzing & splitting the rulebook', progress: 30 })
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

    // 3. Persist sections + write markdown files
    updateGameProgress(gameId, { stage: 'Writing section files', progress: 45 })
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
    const sectionRecords: { id: string, title: string, content: string }[] = []
    for (let i = 0; i < split.sections.length; i++) {
      const s = split.sections[i]!
      const id = randomUUID()
      const filename = `${String(i + 1).padStart(2, '0')}-${slugify(s.slug || s.title)}.md`
      insertSection.run(id, gameId, i, filename, s.title, s.markdown)
      await writeFile(join(gameDir(gameId), 'sections', filename), `# ${s.title}\n\n${s.markdown}\n`, 'utf8')
      sectionRecords.push({ id, title: s.title, content: s.markdown })
    }

    // 4. Chunk
    updateGameProgress(gameId, { stage: 'Chunking content', progress: 55 })
    const allChunks: { sectionId: string, ord: number, content: string }[] = []
    for (const sec of sectionRecords) {
      for (const c of chunkMarkdown(`# ${sec.title}\n\n${sec.content}`)) {
        allChunks.push({ sectionId: sec.id, ord: c.ord, content: c.content })
      }
    }

    // 5. Embed + store vectors
    updateGameProgress(gameId, { stage: `Embedding ${allChunks.length} chunks`, progress: 65 })
    const embeddings = await embedTexts(embModel, allChunks.map(c => c.content))
    const dim = embeddings[0]?.length ?? 0
    if (!dim) throw new Error('Embedding model returned no vectors.')
    const table = ensureVecTable(dim)
    db.prepare('UPDATE games SET embedding_dim = ? WHERE id = ?').run(dim, gameId)

    const insertChunk = db.prepare('INSERT INTO chunks (game_id, section_id, ord, content) VALUES (?, ?, ?, ?)')
    const insertVec = db.prepare(`INSERT INTO ${table} (chunk_id, game_id, embedding) VALUES (?, ?, ?)`)
    const storeChunks = db.transaction(() => {
      for (let i = 0; i < allChunks.length; i++) {
        const c = allChunks[i]!
        const res = insertChunk.run(gameId, c.sectionId, c.ord, c.content)
        // sqlite-vec requires an INTEGER-typed primary key; better-sqlite3 binds plain JS
        // numbers as FLOAT, so the rowid must be passed as a BigInt.
        insertVec.run(BigInt(res.lastInsertRowid), gameId, floatsToBlob(embeddings[i]!))
      }
    })
    storeChunks()

    const groundingText = sectionRecords.map(s => `## ${s.title}\n${s.content}`).join('\n\n').slice(0, MAX_TEXT)

    // 6. Setup guide
    updateGameProgress(gameId, { stage: 'Generating setup guide', progress: 80 })
    await generateSetup(gameId, chat, groundingText)

    // 7. Game pieces
    updateGameProgress(gameId, { stage: 'Cataloguing game pieces', progress: 92 })
    await generatePieces(gameId, chat, groundingText)

    updateGameProgress(gameId, { stage: 'Ready', progress: 100, status: 'ready', error: null })
  } catch (err) {
    console.error('[ingest] failed for', gameId, err)
    updateGameProgress(gameId, { status: 'error', error: describeError(err) })
  }
}

/** Extract a useful message from AI SDK errors (which hide the real cause in responseBody). */
function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string, responseBody?: string, statusCode?: number }
    const parts: string[] = []
    if (e.message) parts.push(e.message)
    if (e.responseBody) parts.push(e.responseBody)
    if (parts.length) return parts.join(' — ').slice(0, 1000)
  }
  return err instanceof Error ? err.message : String(err)
}

export async function generateSetup(gameId: string, model = activeChatModel(), grounding?: string) {
  const db = getDb()
  const context = grounding ?? sectionsText(gameId)
  const { object } = await generateObject({
    model,
    schema: setupSchema,
    maxOutputTokens: 8000,
    system:
      'You build clear, ordered, step-by-step initial setup guides for board games. Base every step '
      + 'strictly on the rulebook. Be concrete about quantities and placement. Do not invent rules.',
    prompt: `Rulebook sections:\n\n${context}\n\nProduce the initial game setup as ordered steps.`
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

export async function generatePieces(gameId: string, model = activeChatModel(), grounding?: string) {
  const db = getDb()
  const context = grounding ?? sectionsText(gameId)
  const { object } = await generateObject({
    model,
    schema: piecesSchema,
    maxOutputTokens: 8000,
    system:
      'You catalogue every physical component of a board game and explain its purpose. Base everything '
      + 'strictly on the rulebook. Do not invent components.',
    prompt: `Rulebook sections:\n\n${context}\n\nList and explain every game piece/component.`
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
