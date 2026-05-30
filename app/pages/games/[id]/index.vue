<script setup lang="ts">
import type { Section } from '#shared/types'

const route = useRoute()
const id = route.params.id as string

const { data: sections } = await useFetch<Section[]>(() => `/api/games/${id}/sections`)
const selected = ref<string | null>(null)

watchEffect(() => {
  if (!sections.value?.length) return
  const wanted = route.query.section as string | undefined
  if (wanted && sections.value.some(s => s.id === wanted)) {
    selected.value = wanted
  } else if (!selected.value) {
    selected.value = sections.value[0]!.id
  }
})

const current = computed(() => sections.value?.find(s => s.id === selected.value) || null)
</script>

<template>
  <GameShell v-slot="{ ready }">
    <div
      v-if="!ready"
      class="text-muted"
    >
      Sections will appear here once processing finishes.
    </div>
    <div
      v-else-if="!sections?.length"
      class="text-muted"
    >
      No sections found.
    </div>
    <div
      v-else
      class="grid md:grid-cols-[260px_1fr] gap-6"
    >
      <nav class="space-y-1">
        <UButton
          v-for="s in sections"
          :key="s.id"
          :color="selected === s.id ? 'primary' : 'neutral'"
          :variant="selected === s.id ? 'soft' : 'ghost'"
          class="w-full justify-start"
          @click="selected = s.id"
        >
          {{ s.title }}
        </UButton>
      </nav>
      <UCard v-if="current">
        <MarkdownBlock :source="current.content" />
      </UCard>
    </div>
  </GameShell>
</template>
