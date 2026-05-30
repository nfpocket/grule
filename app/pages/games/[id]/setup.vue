<script setup lang="ts">
import type { SetupStep } from '#shared/types'

const route = useRoute()
const id = route.params.id as string
const toast = useToast()

const { data: steps, refresh } = await useFetch<SetupStep[]>(() => `/api/games/${id}/setup`)
const regenerating = ref(false)

async function regenerate() {
  regenerating.value = true
  try {
    await $fetch(`/api/games/${id}/setup`, { method: 'POST' })
    await refresh()
    toast.add({ title: 'Setup guide regenerated', color: 'success' })
  } catch (err: unknown) {
    toast.add({ title: 'Failed to regenerate', description: err instanceof Error ? err.message : String(err), color: 'error' })
  } finally {
    regenerating.value = false
  }
}
</script>

<template>
  <GameShell v-slot="{ ready }">
    <div
      v-if="!ready"
      class="text-muted"
    >
      The setup guide is generated during processing.
    </div>
    <div
      v-else
      class="space-y-4"
    >
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">
          Initial setup
        </h2>
        <UButton
          icon="i-lucide-refresh-cw"
          variant="soft"
          color="neutral"
          :loading="regenerating"
          @click="regenerate"
        >
          Regenerate
        </UButton>
      </div>

      <div
        v-if="!steps?.length"
        class="text-muted"
      >
        No setup steps available.
      </div>

      <ol
        v-else
        class="space-y-3"
      >
        <li
          v-for="step in steps"
          :key="step.id"
        >
          <UCard>
            <div class="flex gap-4">
              <div class="shrink-0 size-8 rounded-full bg-primary text-inverted grid place-items-center font-bold">
                {{ step.stepNo }}
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="font-semibold mb-1">
                  {{ step.title }}
                </h3>
                <MarkdownBlock :source="step.body" />
                <p
                  v-if="step.sectionRef"
                  class="text-xs text-muted mt-2"
                >
                  Source: {{ step.sectionRef }}
                </p>
              </div>
            </div>
          </UCard>
        </li>
      </ol>
    </div>
  </GameShell>
</template>
