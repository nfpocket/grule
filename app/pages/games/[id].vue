<script setup lang="ts">
import type { Game, IngestStep, ChatMessageRow } from '#shared/types'

const route = useRoute()
const toast = useToast()
const id = computed(() => route.params.id as string)

const { data: game, refresh } = await useFetch<Game>(
  () => `/api/games/${id.value}`
)
// Loaded once here (shell persists across tabs) and seeded into the chat sidebar.
const { data: history } = await useFetch<ChatMessageRow[]>(
  () => `/api/games/${id.value}/messages`
)

// Share the game with the tab pages
provide(GAME_KEY, game)

// Poll while processing
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    if (game.value?.status === 'processing') refresh()
  }, 2000)
})
onBeforeUnmount(() => clearInterval(timer))

const tabs = computed(() => [
  { label: 'Overview', icon: 'i-lucide-book-open', to: `/games/${id.value}` },
  {
    label: 'Setup',
    icon: 'i-lucide-list-checks',
    to: `/games/${id.value}/setup`
  },
  { label: 'Pieces', icon: 'i-lucide-puzzle', to: `/games/${id.value}/pieces` },
  { label: 'PDF', icon: 'i-lucide-file-text', to: `/games/${id.value}/pdf` }
])
const isActive = (to: string) => route.path === to

const stepUi: Record<
  IngestStep['status'],
  { icon: string, class: string, spin?: boolean }
> = {
  done: { icon: 'i-lucide-check-circle-2', class: 'text-success' },
  active: { icon: 'i-lucide-loader-circle', class: 'text-primary', spin: true },
  error: { icon: 'i-lucide-circle-x', class: 'text-error' },
  pending: { icon: 'i-lucide-circle-dashed', class: 'text-muted' }
}

const reprocessing = ref(false)
async function retry() {
  reprocessing.value = true
  try {
    await $fetch(`/api/games/${id.value}/reprocess`, { method: 'POST' })
    await refresh()
    toast.add({
      title: 'Re-processing started',
      description: 'Resuming from where it left off…',
      color: 'success'
    })
  } catch (err: unknown) {
    const msg
      = err && typeof err === 'object' && 'statusMessage' in err
        ? String((err as { statusMessage: string }).statusMessage)
        : String(err)
    toast.add({ title: 'Could not restart', description: msg, color: 'error' })
  } finally {
    reprocessing.value = false
  }
}

const initialMessages = computed(() => history.value || [])
</script>

<template>
  <UContainer class="py-6 space-y-6">
    <div
      v-if="!game"
      class="text-muted"
    >
      Loading…
    </div>

    <template v-else>
      <div>
        <div class="flex items-center gap-2 text-sm text-muted mb-1">
          <NuxtLink
            to="/"
            class="hover:text-primary"
          > Library </NuxtLink>
          <span>/</span>
          <span>{{ game.title }}</span>
        </div>
        <h1 class="text-2xl font-bold">
          {{ game.title }}
        </h1>
        <div class="flex flex-wrap gap-2 mt-2 text-xs">
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
          <UBadge
            v-if="game.meta?.ages"
            color="neutral"
            variant="soft"
          >
            <UIcon name="i-lucide-baby" /> {{ game.meta.ages }}
          </UBadge>
        </div>
      </div>

      <!-- Processing / failure panel -->
      <UCard
        v-if="game.status !== 'ready'"
        :class="game.status === 'error' ? 'ring-1 ring-error/40' : ''"
      >
        <div class="flex items-center justify-between gap-4 mb-3">
          <div class="flex items-center gap-2 font-medium">
            <UIcon
              v-if="game.status === 'processing'"
              name="i-lucide-loader-circle"
              class="animate-spin text-primary"
            />
            <UIcon
              v-else
              name="i-lucide-triangle-alert"
              class="text-error"
            />
            <span>{{
              game.status === "processing"
                ? "Processing rulebook…"
                : "Processing failed"
            }}</span>
          </div>
          <UButton
            v-if="game.status === 'error'"
            icon="i-lucide-rotate-cw"
            :loading="reprocessing"
            size="sm"
            @click="retry"
          >
            Retry (resume)
          </UButton>
        </div>
        <UProgress
          v-if="game.status === 'processing'"
          :model-value="game.progress"
          class="mb-4"
        />
        <ol
          v-if="game.steps?.length"
          class="space-y-2"
        >
          <li
            v-for="step in game.steps"
            :key="step.key"
            class="flex items-start gap-2 text-sm"
          >
            <UIcon
              :name="stepUi[step.status].icon"
              :class="[
                stepUi[step.status].class,
                stepUi[step.status].spin ? 'animate-spin' : '',
                'mt-0.5 shrink-0'
              ]"
            />
            <div class="min-w-0">
              <span :class="step.status === 'pending' ? 'text-muted' : ''">{{
                step.label
              }}</span>
              <span
                v-if="step.detail"
                :class="[
                  'ml-2 text-xs',
                  step.status === 'error' ? 'text-error' : 'text-muted'
                ]"
              >{{ step.detail }}</span>
            </div>
          </li>
        </ol>
      </UCard>

      <!-- Main content + persistent chat sidebar -->
      <div class="flex flex-col lg:flex-row gap-6 items-start">
        <div class="flex-1 min-w-0 w-full space-y-4">
          <div
            class="flex items-center justify-between gap-2 border-b border-default"
          >
            <div class="flex gap-1 overflow-x-auto">
              <UButton
                v-for="tab in tabs"
                :key="tab.to"
                :to="tab.to"
                :icon="tab.icon"
                :color="isActive(tab.to) ? 'primary' : 'neutral'"
                :variant="isActive(tab.to) ? 'soft' : 'ghost'"
                class="rounded-b-none shrink-0"
              >
                {{ tab.label }}
              </UButton>
            </div>
          </div>

          <GameChatSidebar
            :game-id="id"
            :ready="game.status === 'ready'"
            :initial-messages="initialMessages"
          >
            <UButton
              icon="i-lucide-messages-square"
              color="primary"
              variant="soft"
              class="fixed bottom-4 right-4"
            >
              Ask
            </UButton>
          </GameChatSidebar>

          <NuxtPage />
        </div>
      </div>
    </template>
  </UContainer>
</template>
