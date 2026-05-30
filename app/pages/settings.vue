<script setup lang="ts">
import type { ProviderSettings } from '#shared/types'

interface SettingsResponse {
  settings: ProviderSettings
  configured: { openai: boolean, anthropic: boolean, lmstudio: boolean }
  lmstudioBaseUrl: string
}

const toast = useToast()
const { data } = await useFetch<SettingsResponse>('/api/settings')

const form = reactive<ProviderSettings>({
  chat: { provider: data.value?.settings.chat.provider || 'openai', model: data.value?.settings.chat.model || 'gpt-4o-mini' },
  embedding: { provider: data.value?.settings.embedding.provider || 'openai', model: data.value?.settings.embedding.model || 'text-embedding-3-small' }
})

const chatProviders = [
  { label: 'Anthropic (Claude)', value: 'anthropic' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'LM Studio (local)', value: 'lmstudio' }
]
const embeddingProviders = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'LM Studio (local)', value: 'lmstudio' }
]

// Curated fallback used when a provider's live model list can't be fetched
// (e.g. no API key configured). When a key IS set, the live list takes over.
const CURATED: Record<string, { chat: string[], embedding: string[] }> = {
  openai: {
    chat: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano'],
    embedding: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002']
  },
  anthropic: {
    chat: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    embedding: []
  }
}

const liveModels = reactive<Record<string, { chat: string[], embedding: string[] }>>({})
// User-created custom ids, scoped per `${provider}/${kind}` so they don't leak across providers.
const extra = reactive<Record<string, string[]>>({})
const loadingModels = ref(false)

function extraKey(kind: 'chat' | 'embedding') {
  return `${form[kind].provider}/${kind}`
}

async function loadModels(provider: string) {
  if (liveModels[provider]) return
  loadingModels.value = true
  try {
    const res = await $fetch<{ chat: string[], embedding: string[] }>('/api/providers/models', { query: { provider } })
    liveModels[provider] = { chat: res.chat, embedding: res.embedding }
  } catch {
    liveModels[provider] = { chat: [], embedding: [] }
  } finally {
    loadingModels.value = false
  }
}

// The real models offered by the *current* provider — does NOT force-include the
// currently selected value, so it can be used to detect a stale cross-provider selection.
function availableModels(kind: 'chat' | 'embedding'): string[] {
  const provider = form[kind].provider
  return [
    ...(liveModels[provider]?.[kind] ?? []),
    ...(CURATED[provider]?.[kind] ?? []),
    ...(extra[extraKey(kind)] ?? [])
  ]
}

// Dropdown items: available models plus the current selection (so a valid saved/custom
// value still displays). After a provider switch the selection is reset first, so the
// previous provider's model never lingers here.
function optionsFor(kind: 'chat' | 'embedding'): string[] {
  const set = new Set<string>(availableModels(kind))
  if (form[kind].model) set.add(form[kind].model)
  return [...set]
}
const chatOptions = computed(() => optionsFor('chat'))
const embeddingOptions = computed(() => optionsFor('embedding'))

function onCreate(kind: 'chat' | 'embedding', value: string) {
  const key = extraKey(kind)
  const list = (extra[key] ??= [])
  if (!list.includes(value)) list.push(value)
  form[kind].model = value
}

function resetModelIfInvalid(kind: 'chat' | 'embedding') {
  const avail = availableModels(kind)
  if (!avail.includes(form[kind].model)) {
    form[kind].model = avail[0] || ''
  }
}

onMounted(() => {
  loadModels(form.chat.provider)
  loadModels(form.embedding.provider)
})
watch(() => form.chat.provider, async (p) => {
  await loadModels(p)
  resetModelIfInvalid('chat')
})
watch(() => form.embedding.provider, async (p) => {
  await loadModels(p)
  resetModelIfInvalid('embedding')
})

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await $fetch('/api/settings', { method: 'POST', body: form })
    toast.add({ title: 'Settings saved', color: 'success' })
  } catch (err: unknown) {
    toast.add({ title: 'Save failed', description: errMsg(err), color: 'error' })
  } finally {
    saving.value = false
  }
}

const testing = reactive({ chat: false, embedding: false })
async function test(kind: 'chat' | 'embedding') {
  testing[kind] = true
  try {
    const res = await $fetch<{ ok: boolean, error?: string, dim?: number }>('/api/providers/test', {
      method: 'POST',
      body: { kind, provider: form[kind].provider, model: form[kind].model }
    })
    if (res.ok) {
      toast.add({ title: `${kind} OK`, description: res.dim ? `Embedding dim: ${res.dim}` : 'Connection successful', color: 'success' })
    } else {
      toast.add({ title: `${kind} failed`, description: res.error, color: 'error' })
    }
  } catch (err: unknown) {
    toast.add({ title: 'Test failed', description: errMsg(err), color: 'error' })
  } finally {
    testing[kind] = false
  }
}

function errMsg(err: unknown): string {
  if (err && typeof err === 'object' && 'statusMessage' in err) return String((err as { statusMessage: string }).statusMessage)
  return err instanceof Error ? err.message : String(err)
}
</script>

<template>
  <UContainer class="py-8 max-w-2xl space-y-6">
    <div>
      <h1 class="text-2xl font-bold">
        Settings
      </h1>
      <p class="text-muted">
        Choose which AI providers power analysis, chat and embeddings.
      </p>
    </div>

    <UAlert
      v-if="data"
      color="neutral"
      variant="soft"
      icon="i-lucide-key-round"
      title="API keys are read from environment variables"
    >
      <template #description>
        <ul class="text-sm mt-1 space-y-0.5">
          <li>
            OpenAI: <UBadge
              :color="data.configured.openai ? 'success' : 'error'"
              variant="subtle"
              size="sm"
            >
              {{ data.configured.openai ? 'configured' : 'NUXT_OPENAI_API_KEY missing' }}
            </UBadge>
          </li>
          <li>
            Anthropic: <UBadge
              :color="data.configured.anthropic ? 'success' : 'error'"
              variant="subtle"
              size="sm"
            >
              {{ data.configured.anthropic ? 'configured' : 'NUXT_ANTHROPIC_API_KEY missing' }}
            </UBadge>
          </li>
          <li>
            LM Studio: <UBadge
              color="neutral"
              variant="subtle"
              size="sm"
            >
              {{ data.lmstudioBaseUrl }}
            </UBadge>
          </li>
        </ul>
      </template>
    </UAlert>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          Chat & analysis model
        </h2>
        <p class="text-sm text-muted">
          Used for splitting the rulebook, generating setup/pieces, and answering questions.
        </p>
      </template>
      <div class="space-y-4">
        <UFormField label="Provider">
          <USelect
            v-model="form.chat.provider"
            :items="chatProviders"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Model"
          help="Pick a model (type to add a custom id)"
        >
          <USelectMenu
            v-model="form.chat.model"
            :items="chatOptions"
            :loading="loadingModels"
            create-item
            class="w-full"
            @create="onCreate('chat', $event)"
          />
        </UFormField>
        <UButton
          variant="soft"
          color="neutral"
          icon="i-lucide-plug"
          :loading="testing.chat"
          @click="test('chat')"
        >
          Test connection
        </UButton>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          Embedding model
        </h2>
        <p class="text-sm text-muted">
          Used for RAG vector search. Anthropic has no embeddings API — use OpenAI or LM Studio.
        </p>
      </template>
      <div class="space-y-4">
        <UFormField label="Provider">
          <USelect
            v-model="form.embedding.provider"
            :items="embeddingProviders"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Model"
          help="Pick a model (type to add a custom id)"
        >
          <USelectMenu
            v-model="form.embedding.model"
            :items="embeddingOptions"
            :loading="loadingModels"
            create-item
            class="w-full"
            @create="onCreate('embedding', $event)"
          />
        </UFormField>
        <UButton
          variant="soft"
          color="neutral"
          icon="i-lucide-plug"
          :loading="testing.embedding"
          @click="test('embedding')"
        >
          Test connection
        </UButton>
      </div>
    </UCard>

    <UAlert
      color="warning"
      variant="soft"
      icon="i-lucide-info"
      title="Changing the embedding model"
      description="Each game stores the embedding model used at ingestion. New settings apply to newly uploaded games; existing games keep their original embeddings."
    />

    <div class="flex justify-end">
      <UButton
        size="lg"
        icon="i-lucide-save"
        :loading="saving"
        @click="save"
      >
        Save settings
      </UButton>
    </div>
  </UContainer>
</template>
