<script setup lang="ts">
import type { Piece } from '#shared/types'

const route = useRoute()
const id = route.params.id as string
const toast = useToast()
const { ready } = useGameContext()
const { t } = useI18n()

const { data: pieces, refresh } = await useFetch<Piece[]>(() => `/api/games/${id}/pieces`)
const regenerating = ref(false)

async function regenerate() {
  regenerating.value = true
  try {
    await $fetch(`/api/games/${id}/pieces`, { method: 'POST' })
    await refresh()
    toast.add({ title: t('pieces.regenerated'), color: 'success' })
  } catch (err: unknown) {
    toast.add({ title: t('pieces.regenerateFailed'), description: err instanceof Error ? err.message : String(err), color: 'error' })
  } finally {
    regenerating.value = false
  }
}
</script>

<template>
  <div
    v-if="!ready"
    class="text-muted"
  >
    {{ t('pieces.pending') }}
  </div>
  <div
    v-else
    class="space-y-4"
  >
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">
        {{ t('pieces.title') }}
      </h2>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="soft"
        color="neutral"
        :loading="regenerating"
        @click="regenerate"
      >
        {{ t('common.regenerate') }}
      </UButton>
    </div>

    <div
      v-if="!pieces?.length"
      class="text-muted"
    >
      {{ t('pieces.empty') }}
    </div>

    <div
      v-else
      class="grid gap-4 sm:grid-cols-2"
    >
      <UCard
        v-for="piece in pieces"
        :key="piece.id"
      >
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-semibold">
            {{ piece.name }}
          </h3>
          <UBadge
            v-if="piece.quantity"
            color="neutral"
            variant="soft"
            class="shrink-0"
          >
            {{ piece.quantity }}
          </UBadge>
        </div>
        <UBadge
          v-if="piece.category"
          color="primary"
          variant="subtle"
          size="sm"
          class="mt-1"
        >
          {{ piece.category }}
        </UBadge>
        <div class="mt-2">
          <MarkdownBlock :source="piece.description" />
        </div>
      </UCard>
    </div>
  </div>
</template>
