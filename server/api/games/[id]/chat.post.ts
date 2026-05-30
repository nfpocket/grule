import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText
} from 'ai'
import type { UIMessage } from 'ai'
import type { Citation, EmbeddingProviderId, ProviderId } from '#shared/types'

function textOf(message: UIMessage): string {
  return (message.parts || [])
    .filter((p): p is { type: 'text', text: string } => p.type === 'text')
    .map(p => p.text)
    .join(' ')
    .trim()
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const game = getGame(id)
  if (!game) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  if (game.status !== 'ready') {
    throw createError({ statusCode: 409, statusMessage: 'This game is still being processed.' })
  }
  if (!game.chatModel || !game.chatProvider) {
    throw createError({ statusCode: 400, statusMessage: 'Game has no chat model configured.' })
  }

  const body = await readBody<{ messages: UIMessage[] }>(event)
  const messages = body.messages ?? []
  const lastUser = [...messages].reverse().find(m => m.role === 'user')
  const query = lastUser ? textOf(lastUser) : ''

  const db = getDb()

  // Retrieve relevant chunks via vector search
  let context = '(no relevant sections found)'
  const citations: Citation[] = []
  if (query && game.embeddingProvider && game.embeddingModel && game.embeddingDim) {
    const emb = embeddingModel(game.embeddingProvider as EmbeddingProviderId, game.embeddingModel)
    const queryVec = await embedText(emb, query)
    const hits = searchSimilar(id, game.embeddingDim, queryVec, 6)
    if (hits.length) {
      context = hits.map((h, i) => `[${i + 1}] (page ${h.page ?? '?'})\n${h.content}`).join('\n\n')
      const seen = new Set<number>()
      for (const h of hits) {
        if (h.page != null && !seen.has(h.page)) {
          seen.add(h.page)
          citations.push({ page: h.page })
        }
      }
    }
  }

  // Persist the user's message
  if (query) {
    db.prepare('INSERT INTO chat_messages (game_id, role, content, citations, created_at) VALUES (?, ?, ?, NULL, ?)')
      .run(id, 'user', query, Date.now())
  }

  const system = `You are a rules expert for the board game "${game.title}". `
    + 'Answer the player\'s question using ONLY the rulebook context below. '
    + 'If the answer is not contained in the context, clearly say you could not find it in the rulebook '
    + 'rather than guessing. Reference the relevant page numbers in your answer. Be concise and precise.\n\n'
    + `--- RULEBOOK CONTEXT ---\n${context}\n--- END CONTEXT ---`

  const modelMessages = await convertToModelMessages(messages)

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      if (citations.length) writer.write({ type: 'data-citations', data: citations })
      const result = streamText({
        model: chatModel(game.chatProvider as ProviderId, game.chatModel!),
        system,
        messages: modelMessages,
        onFinish: ({ text }) => {
          db.prepare('INSERT INTO chat_messages (game_id, role, content, citations, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(id, 'assistant', text, citations.length ? JSON.stringify(citations) : null, Date.now())
        }
      })
      writer.merge(result.toUIMessageStream())
    }
  })

  return createUIMessageStreamResponse({ stream })
})
