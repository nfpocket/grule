import { z } from 'zod'

const bodySchema = z.object({
  chat: z.object({
    provider: z.enum(['anthropic', 'openai', 'lmstudio']),
    model: z.string().min(1)
  }),
  embedding: z.object({
    provider: z.enum(['openai', 'lmstudio']),
    model: z.string().min(1)
  })
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  return saveSettings(body)
})
