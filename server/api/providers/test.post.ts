import { embed, generateText } from 'ai'
import { z } from 'zod'

const bodySchema = z.object({
  kind: z.enum(['chat', 'embedding']),
  provider: z.enum(['anthropic', 'openai', 'lmstudio']),
  model: z.string().min(1)
})

export default defineEventHandler(async (event) => {
  const { kind, provider, model } = await readValidatedBody(event, bodySchema.parse)
  try {
    if (kind === 'chat') {
      const { text } = await generateText({
        model: chatModel(provider, model),
        prompt: 'Reply with the single word: ok'
      })
      return { ok: true, sample: text.slice(0, 40) }
    }
    if (provider === 'anthropic') {
      throw new Error('Anthropic does not provide an embeddings API. Use OpenAI or LM Studio for embeddings.')
    }
    const { embedding } = await embed({ model: embeddingModel(provider, model), value: 'ok' })
    return { ok: true, dim: embedding.length }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})
