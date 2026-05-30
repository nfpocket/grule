<script setup lang="ts">
import type { Section } from "#shared/types";

const route = useRoute();
const id = route.params.id as string;
const { ready } = useGameContext();

// Section navigation lives in the parent layout's aside; selection is driven by
// the ?section= query param. Shared key reuses the aside's sections payload.
const { data: sections } = await useFetch<Section[]>(
  () => `/api/games/${id}/sections`,
  { key: `sections-${id}` },
);

const current = computed(() => {
  if (!sections.value?.length) return null;
  const wanted = route.query.section as string | undefined;
  return sections.value.find((s) => s.id === wanted) ?? sections.value[0]!;
});
</script>

<template>
  <div v-if="!ready" class="text-muted">
    Sections will appear here once processing finishes.
  </div>
  <div v-else-if="!sections?.length" class="text-muted">No sections found.</div>
  <div v-else class="space-y-4">
    <!-- Mobile section selector — on desktop the layout aside handles this. -->
    <nav class="lg:hidden flex gap-1 overflow-x-auto pb-1">
      <UButton
        v-for="s in sections"
        :key="s.id"
        :to="{ query: { section: s.id } }"
        :color="current?.id === s.id ? 'primary' : 'neutral'"
        :variant="current?.id === s.id ? 'soft' : 'ghost'"
        size="sm"
        class="shrink-0"
      >
        {{ s.title }}
      </UButton>
    </nav>
    <UCard v-if="current">
      <MarkdownBlock :source="current.content" />
    </UCard>
  </div>
</template>
