export default defineEventHandler(() => {
  const cfg = useRuntimeConfig()
  return {
    settings: getSettings(),
    configured: {
      openai: !!cfg.openaiApiKey,
      anthropic: !!cfg.anthropicApiKey,
      lmstudio: true
    },
    lmstudioBaseUrl: cfg.lmstudioBaseUrl
  }
})
