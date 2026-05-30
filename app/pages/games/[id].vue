<script setup lang="ts">
import type { Game, IngestStep, ChatMessageRow, Section } from '#shared/types'

const route = useRoute()
const toast = useToast()
const { t } = useI18n()
const id = computed(() => route.params.id as string)

const { data: game, refresh } = await useFetch<Game>(
  () => `/api/games/${id.value}`
)
// Loaded once here (shell persists across tabs) and seeded into the chat sidebar.
const { data: history } = await useFetch<ChatMessageRow[]>(
  () => `/api/games/${id.value}/messages`
)
// Sections power the collapsible "Overview" sub-tree in the aside nav.
// Shared key so the Overview page reuses the same payload.
const { data: sections } = await useFetch<Section[]>(
  () => `/api/games/${id.value}/sections`,
  { key: `sections-${route.params.id}` }
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

const isActive = (to: string) => route.path === to
const base = computed(() => `/games/${id.value}`)
const onOverview = computed(() => route.path === base.value)

// The active section on the Overview page is driven by ?section= (first by default).
const activeSection = computed(() => {
  if (!onOverview.value || !sections.value?.length) return null
  const wanted = route.query.section as string | undefined
  return sections.value.some(s => s.id === wanted)
    ? wanted
    : sections.value[0]!.id
})

const navItems = computed(() => [
  {
    label: t('nav.overview'),
    icon: 'i-lucide-book-open',
    to: base.value,
    active: onOverview.value,
    defaultOpen: onOverview.value,
    children: (sections.value ?? []).map(s => ({
      label: s.title,
      to: { path: base.value, query: { section: s.id } },
      active: activeSection.value === s.id
    }))
  },
  {
    label: t('nav.setup'),
    icon: 'i-lucide-list-checks',
    to: `${base.value}/setup`,
    active: isActive(`${base.value}/setup`)
  },
  {
    label: t('nav.pieces'),
    icon: 'i-lucide-puzzle',
    to: `${base.value}/pieces`,
    active: isActive(`${base.value}/pieces`)
  },
  {
    label: t('nav.pdf'),
    icon: 'i-lucide-file-text',
    to: `${base.value}/pdf`,
    active: isActive(`${base.value}/pdf`)
  }
])

// Mobile nav is a flat strip — drop the Overview sub-tree.
const mobileNavItems = computed(() =>
  navItems.value.map(item => ({
    label: item.label,
    icon: item.icon,
    to: item.to,
    active: item.active
  }))
)

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
      title: t('game.reprocessStarted'),
      description: t('game.reprocessStartedDesc'),
      color: 'success'
    })
  } catch (err: unknown) {
    const msg
      = err && typeof err === 'object' && 'statusMessage' in err
        ? String((err as { statusMessage: string }).statusMessage)
        : String(err)
    toast.add({ title: t('game.reprocessFailed'), description: msg, color: 'error' })
  } finally {
    reprocessing.value = false
  }
}

const initialMessages = computed(() => history.value || [])
</script>

<template>
  <UContainer class="py-6">
    <div
      v-if="!game"
      class="text-muted"
    >
      {{ t('common.loading') }}
    </div>

    <template v-else>
      <!-- Prominent page header (full width, all breakpoints) -->
      <div class="mb-6">
        <div class="flex items-center gap-2 text-sm text-muted mb-1">
          <NuxtLink
            to="/"
            class="hover:text-primary"
          > {{ t('nav.library') }} </NuxtLink>
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

      <UPage>
        <!-- Left navigation aside (desktop) -->
        <template #left>
          <UPageAside>
            <UNavigationMenu
              :items="navItems"
              orientation="vertical"
            />
          </UPageAside>
        </template>

        <!-- Mobile navigation (hidden on desktop, where the aside takes over) -->
        <UNavigationMenu
          :items="mobileNavItems"
          class="lg:hidden mb-6 overflow-x-auto"
        />

        <!-- Processing / failure panel -->
        <UCard
          v-if="game.status !== 'ready'"
          class="mb-6"
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
                  ? t('game.processing')
                  : t('game.processingFailed')
              }}</span>
            </div>
            <UButton
              v-if="game.status === 'error'"
              icon="i-lucide-rotate-cw"
              :loading="reprocessing"
              size="sm"
              @click="retry"
            >
              {{ t('game.retry') }}
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

        <!-- Page content + persistent chat sidebar -->
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
            {{ t('game.ask') }}
          </UButton>
        </GameChatSidebar>

        <NuxtPage />
      </UPage>
    </template>
  </UContainer>
</template>
