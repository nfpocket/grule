<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string
const { t } = useI18n()

// A `?page=N` query (e.g. from a chat citation) jumps the viewer to that page.
const page = computed(() => (route.query.page ? Number(route.query.page) : null))
const src = computed(() => `/api/games/${id}/pdf${page.value ? `#page=${page.value}` : ''}`)
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <p class="text-sm text-muted">
        <span v-if="page">{{ t('pdfPage.jumped', { page }) }}</span>{{ t('pdfPage.description') }}
      </p>
      <UButton
        :to="`/api/games/${id}/pdf`"
        target="_blank"
        icon="i-lucide-external-link"
        size="xs"
        variant="ghost"
        color="neutral"
      >
        {{ t('pdfPage.openNewTab') }}
      </UButton>
    </div>
    <iframe
      :key="src"
      :src="src"
      class="w-full h-[calc(100vh-22rem)] min-h-120 rounded-lg border border-default bg-white"
      title="Rulebook PDF"
    />
  </div>
</template>
