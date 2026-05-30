// Lists available models for a hosted provider (OpenAI / Anthropic) so the
// settings UI can offer a dropdown instead of free text. Returns empty arrays
// (never throws) when no key is configured or the provider is unreachable, so
// the client can fall back to a curated list.
interface ModelLists {
  chat: string[]
  embedding: string[]
  error?: string
}

const OPENAI_EXCLUDE = /(embedding|whisper|tts|audio|realtime|image|dall|moderation|transcribe|search|codex)/
const OPENAI_CHAT = /^(gpt-|o\d|chatgpt)/

export default defineEventHandler(async (event): Promise<ModelLists> => {
  const provider = String(getQuery(event).provider || '')
  const cfg = useRuntimeConfig()

  try {
    if (provider === 'openai') {
      if (!cfg.openaiApiKey) return { chat: [], embedding: [] }
      const res = await $fetch<{ data: { id: string }[] }>('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${cfg.openaiApiKey}` }
      })
      const ids = res.data.map(m => m.id)
      return {
        chat: ids.filter(id => OPENAI_CHAT.test(id) && !OPENAI_EXCLUDE.test(id)).sort(),
        embedding: ids.filter(id => id.includes('embedding')).sort()
      }
    }

    if (provider === 'anthropic') {
      if (!cfg.anthropicApiKey) return { chat: [], embedding: [] }
      const res = await $fetch<{ data: { id: string }[] }>('https://api.anthropic.com/v1/models?limit=100', {
        headers: { 'x-api-key': cfg.anthropicApiKey, 'anthropic-version': '2023-06-01' }
      })
      // Anthropic has no embeddings API; all listed models are chat models.
      return { chat: res.data.map(m => m.id), embedding: [] }
    }

    if (provider === 'lmstudio') {
      const base = cfg.lmstudioBaseUrl
      let items: { id: string, type?: string }[] = []
      try {
        // Native API exposes a `type` (llm | vlm | embeddings) and includes not-loaded models.
        const origin = new URL(base).origin
        const res = await $fetch<{ data: { id: string, type?: string }[] }>(`${origin}/api/v0/models`)
        items = res.data
      } catch {
        // Fall back to the OpenAI-compatible list (no type info).
        const res = await $fetch<{ data: { id: string }[] }>(`${base.replace(/\/$/, '')}/models`)
        items = res.data
      }
      // `type` mislabels some embedding models (e.g. jina as "llm"), so also match by name.
      const isEmbed = (m: { id: string, type?: string }) => m.type === 'embeddings' || /embed/i.test(m.id)
      return {
        chat: items.filter(m => !isEmbed(m)).map(m => m.id).sort(),
        embedding: items.filter(m => isEmbed(m)).map(m => m.id).sort()
      }
    }

    return { chat: [], embedding: [] }
  } catch (err) {
    return { chat: [], embedding: [], error: err instanceof Error ? err.message : String(err) }
  }
})
