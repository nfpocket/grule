<script setup lang="ts">
import type { Game } from '#shared/types'

const route = useRoute()
const id = computed(() => route.params.id as string)

const { data: game, refresh } = await useFetch<Game>(() => `/api/games/${id.value}`)

// Poll while processing so users see live ingestion progress
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    if (game.value?.status === 'processing') refresh()
  }, 2000)
})
onBeforeUnmount(() => clearInterval(timer))

const tabs = computed(() => [
  { label: 'Overview', icon: 'i-lucide-book-open', to: `/games/${id.value}` },
  { label: 'Chat', icon: 'i-lucide-messages-square', to: `/games/${id.value}/chat` },
  { label: 'Setup', icon: 'i-lucide-list-checks', to: `/games/${id.value}/setup` },
  { label: 'Pieces', icon: 'i-lucide-puzzle', to: `/games/${id.value}/pieces` }
])

const isActive = (to: string) => route.path === to
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
          >
            Library
          </NuxtLink>
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

      <!-- Processing / error banners -->
      <UAlert
        v-if="game.status === 'processing'"
        color="warning"
        variant="soft"
        :title="game.stage || 'Analyzing rulebook…'"
        icon="i-lucide-loader-circle"
      >
        <template #description>
          <UProgress
            :model-value="game.progress"
            class="mt-2"
          />
        </template>
      </UAlert>
      <UAlert
        v-else-if="game.status === 'error'"
        color="error"
        variant="soft"
        title="Processing failed"
        :description="game.error || 'Unknown error'"
        icon="i-lucide-triangle-alert"
      />

      <!-- Tab nav -->
      <div class="flex gap-1 border-b border-default">
        <UButton
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          :icon="tab.icon"
          :color="isActive(tab.to) ? 'primary' : 'neutral'"
          :variant="isActive(tab.to) ? 'soft' : 'ghost'"
          class="rounded-b-none"
        >
          {{ tab.label }}
        </UButton>
      </div>

      <slot
        :game="game"
        :ready="game.status === 'ready'"
      />
    </template>
  </UContainer>
</template>
