<script setup lang="ts">
import type { Game } from '#shared/types'

const toast = useToast()
const { data: games, refresh } = await useFetch<Game[]>('/api/games')

const uploading = ref(false)
const fileInput = ref<HTMLInputElement>()

function pickFile() {
  fileInput.value?.click()
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    await $fetch('/api/games', { method: 'POST', body: form })
    toast.add({ title: 'Upload started', description: 'Analyzing the rulebook…', color: 'success' })
    await refresh()
  } catch (err: unknown) {
    toast.add({ title: 'Upload failed', description: errMsg(err), color: 'error' })
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function remove(game: Game) {
  if (!confirm(`Delete "${game.title}" and all its data?`)) return
  await $fetch(`/api/games/${game.id}`, { method: 'DELETE' })
  await refresh()
}

function errMsg(err: unknown): string {
  if (err && typeof err === 'object' && 'statusMessage' in err) return String((err as { statusMessage: string }).statusMessage)
  return err instanceof Error ? err.message : String(err)
}

const statusColor = (s: Game['status']) => (s === 'ready' ? 'success' : s === 'error' ? 'error' : 'warning')

// Poll while any game is still processing
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    if (games.value?.some(g => g.status === 'processing')) refresh()
  }, 2500)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <UContainer class="py-8 space-y-8">
    <div class="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold">
          Your games
        </h1>
        <p class="text-muted">
          Upload a rulebook PDF and let the AI break it down.
        </p>
      </div>
      <div>
        <input
          ref="fileInput"
          type="file"
          accept="application/pdf"
          class="hidden"
          @change="onFile"
        >
        <UButton
          icon="i-lucide-upload"
          :loading="uploading"
          size="lg"
          @click="pickFile"
        >
          Upload rulebook (PDF)
        </UButton>
      </div>
    </div>

    <div
      v-if="!games?.length"
      class="text-center py-20 border border-dashed border-default rounded-lg"
    >
      <UIcon
        name="i-lucide-book-open-text"
        class="size-10 text-muted mx-auto mb-3"
      />
      <p class="text-muted">
        No games yet. Upload your first rulebook to get started.
      </p>
    </div>

    <div
      v-else
      class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <UCard
        v-for="game in games"
        :key="game.id"
        class="flex flex-col"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <NuxtLink
              :to="`/games/${game.id}`"
              class="font-semibold text-lg hover:text-primary truncate block"
            >
              {{ game.title }}
            </NuxtLink>
            <p
              v-if="game.meta?.summary"
              class="text-sm text-muted line-clamp-2 mt-1"
            >
              {{ game.meta.summary }}
            </p>
          </div>
          <UBadge
            :color="statusColor(game.status)"
            variant="subtle"
            class="shrink-0"
          >
            {{ game.status }}
          </UBadge>
        </div>

        <div
          v-if="game.status === 'processing'"
          class="mt-4"
        >
          <p class="text-sm text-muted mb-1">
            {{ game.stage || 'Working…' }}
          </p>
          <UProgress :model-value="game.progress" />
        </div>

        <p
          v-else-if="game.status === 'error'"
          class="mt-4 text-sm text-error"
        >
          {{ game.error }}
        </p>

        <div
          v-else
          class="mt-4 flex flex-wrap gap-2 text-xs text-muted"
        >
          <UBadge
            v-if="game.meta?.players"
            color="neutral"
            variant="soft"
          >
            <UIcon name="i-lucide-users" /> {{ game.meta.players }}
          </UBadge>
          <UBadge
            v-if="game.meta?.playtime"
            color="neutral"
            variant="soft"
          >
            <UIcon name="i-lucide-clock" /> {{ game.meta.playtime }}
          </UBadge>
        </div>

        <template #footer>
          <div class="flex items-center justify-between">
            <UButton
              :to="`/games/${game.id}`"
              :disabled="game.status !== 'ready'"
              variant="soft"
              trailing-icon="i-lucide-arrow-right"
              size="sm"
            >
              Open
            </UButton>
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="sm"
              @click="remove(game)"
            />
          </div>
        </template>
      </UCard>
    </div>
  </UContainer>
</template>
