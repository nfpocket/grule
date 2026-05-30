// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxtjs/i18n'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // server-only secrets (override via .env)
    openaiApiKey: process.env.NUXT_OPENAI_API_KEY || '',
    anthropicApiKey: process.env.NUXT_ANTHROPIC_API_KEY || '',
    lmstudioBaseUrl: process.env.NUXT_LMSTUDIO_BASE_URL || 'http://localhost:1234/v1',
    dataDir: process.env.NUXT_DATA_DIR || './data'
  },

  compatibilityDate: '2025-01-15',

  // better-sqlite3 / sqlite-vec are native CJS deps — keep them external to Nitro's bundle
  nitro: {
    externals: {
      inline: [],
      external: ['better-sqlite3', 'sqlite-vec']
    },
    moduleSideEffects: ['better-sqlite3', 'sqlite-vec']
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  i18n: {
    defaultLocale: 'en',
    strategy: 'no_prefix',
    locales: [
      { code: 'en', name: 'English', language: 'en-US', file: 'en.json' },
      { code: 'de', name: 'Deutsch', language: 'de-DE', file: 'de.json' }
    ],
    bundle: {
      optimizeTranslationDirective: false
    },
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      redirectOn: 'root'
    }
  }
})
