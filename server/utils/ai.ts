import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { EmbeddingModel, LanguageModel } from 'ai'
import type { EmbeddingProviderId, ProviderId } from '#shared/types'

function keys() {
  const cfg = useRuntimeConfig()
  return {
    openaiApiKey: cfg.openaiApiKey,
    anthropicApiKey: cfg.anthropicApiKey,
    lmstudioBaseUrl: cfg.lmstudioBaseUrl
  }
}

function lmstudio() {
  // LM Studio exposes an OpenAI-compatible server (default http://localhost:1234/v1).
  // supportsStructuredOutputs makes generateObject send `response_format: json_schema`
  // (LM Studio rejects the default `json_object`). Thinking/reasoning control is left to
  // the model config in LM Studio — see README (reasoning models work but are slower).
  return createOpenAICompatible({
    name: 'lmstudio',
    baseURL: keys().lmstudioBaseUrl,
    supportsStructuredOutputs: true
  })
}

export function chatModel(provider: ProviderId, model: string): LanguageModel {
  switch (provider) {
    case 'anthropic': {
      const k = keys().anthropicApiKey
      if (!k) throw createError({ statusCode: 400, statusMessage: 'Anthropic API key not configured (NUXT_ANTHROPIC_API_KEY).' })
      return createAnthropic({ apiKey: k })(model)
    }
    case 'openai': {
      const k = keys().openaiApiKey
      if (!k) throw createError({ statusCode: 400, statusMessage: 'OpenAI API key not configured (NUXT_OPENAI_API_KEY).' })
      return createOpenAI({ apiKey: k })(model)
    }
    case 'lmstudio':
      return lmstudio()(model)
    default:
      throw createError({ statusCode: 400, statusMessage: `Unknown chat provider: ${provider}` })
  }
}

export function embeddingModel(provider: EmbeddingProviderId, model: string): EmbeddingModel {
  switch (provider) {
    case 'openai': {
      const k = keys().openaiApiKey
      if (!k) throw createError({ statusCode: 400, statusMessage: 'OpenAI API key not configured (NUXT_OPENAI_API_KEY).' })
      return createOpenAI({ apiKey: k }).embeddingModel(model)
    }
    case 'lmstudio':
      return lmstudio().embeddingModel(model)
    default:
      throw createError({ statusCode: 400, statusMessage: `Unknown embedding provider: ${provider}` })
  }
}

export function activeChatModel(): LanguageModel {
  const s = getSettings()
  return chatModel(s.chat.provider, s.chat.model)
}

export function activeEmbeddingModel(): EmbeddingModel {
  const s = getSettings()
  return embeddingModel(s.embedding.provider, s.embedding.model)
}
