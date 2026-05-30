<script setup lang="ts">
import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import type { ChatMessageRow, Citation } from '#shared/types'

const props = defineProps<{
  gameId: string
  ready: boolean
  initialMessages: ChatMessageRow[]
}>()
defineEmits<{ close: [] }>()

const { t } = useI18n()

const view = ref<'chat' | 'pdf'>('chat')
const open = ref(false)
const pdfPage = ref<number | null>(null)
const pdfSrc = computed(
  () =>
    `/api/games/${props.gameId}/pdf${pdfPage.value ? `#page=${pdfPage.value}` : ''}`
)

function openPage(page: number) {
  pdfPage.value = page
  view.value = 'pdf'
}

const seeded = props.initialMessages.map(m => ({
  id: String(m.id),
  role: m.role,
  parts: [
    { type: 'text', text: m.content },
    ...(m.citations?.length
      ? [{ type: 'data-citations', data: m.citations }]
      : [])
  ]
}))

const chat = new Chat({
  transport: new DefaultChatTransport({
    api: `/api/games/${props.gameId}/chat`
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: seeded as any
})

const input = ref('')
const busy = computed(
  () => chat.status === 'submitted' || chat.status === 'streaming'
)

const toast = useToast()
const clearing = ref(false)
async function clearChat() {
  if (clearing.value || !chat.messages.length) return
  clearing.value = true
  try {
    await $fetch(`/api/games/${props.gameId}/messages`, { method: 'DELETE' })
    chat.messages = []
  } catch (err: unknown) {
    const msg
      = err && typeof err === 'object' && 'statusMessage' in err
        ? String((err as { statusMessage: string }).statusMessage)
        : String(err)
    toast.add({
      title: t('chat.clearFailed'),
      description: msg,
      color: 'error'
    })
  } finally {
    clearing.value = false
  }
}

function send() {
  const text = input.value.trim()
  if (!text || busy.value) return
  chat.sendMessage({ text })
  input.value = ''
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter(p => p.type === 'text')
    .map(p => p.text)
    .join('')
}
function citationsOf(message: UIMessage): Citation[] {
  return message.parts
    .filter(p => p.type === 'data-citations')
    .flatMap(p => (p as { data?: Citation[] }).data || [])
}

const scroller = ref<HTMLElement>()
watch(
  () => chat.messages.map(m => textOf(m)).join(''),
  async () => {
    await nextTick()
    scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
  }
)

const suggestions = computed(() => [
  t('chat.suggestions.win'),
  t('chat.suggestions.turn'),
  t('chat.suggestions.scoring')
])
</script>

<template>
  <USlideover
    v-model:open="open"
    :ui="{
      content: 'lg:w-[33vw] lg:min-w-[500px] max-w-none'
    }"
    :overlay="false"
    :modal="false"
  >
    <slot />

    <template #header>
      <div class="flex items-center justify-between gap-2 w-full">
        <div class="flex items-center gap-1">
          <UButton
            :color="view === 'chat' ? 'primary' : 'neutral'"
            :variant="view === 'chat' ? 'soft' : 'ghost'"
            icon="i-lucide-messages-square"
            size="xs"
            @click="view = 'chat'"
          >
            {{ t('chat.tabChat') }}
          </UButton>
          <UButton
            :color="view === 'pdf' ? 'primary' : 'neutral'"
            :variant="view === 'pdf' ? 'soft' : 'ghost'"
            icon="i-lucide-file-text"
            size="xs"
            @click="view = 'pdf'"
          >
            {{ t('chat.tabPdf') }}
          </UButton>
        </div>
        <div class="flex items-center gap-1">
          <UButton
            v-if="view === 'chat' && chat.messages.length"
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="clearing"
            :aria-label="t('chat.clear')"
            @click="clearChat"
          />
          <UButton
            icon="i-lucide-panel-right-close"
            color="neutral"
            variant="ghost"
            :aria-label="t('chat.close')"
            @click="open = false"
          />
        </div>
      </div>
    </template>

    <template #body>
      <div class="flex-1 min-h-0 flex flex-col h-full">
        <!-- PDF view -->
        <div
          v-show="view === 'pdf'"
          class="flex-1 min-h-0 flex flex-col h-full"
        >
          <div
            class="flex items-center justify-between px-3 py-1.5 text-xs text-muted border-b border-default"
          >
            <span>{{ pdfPage ? t('chat.page', { page: pdfPage }) : t('chat.rulebook') }}</span>
            <UButton
              :to="`/games/${gameId}/pdf${pdfPage ? `?page=${pdfPage}` : ''}`"
              icon="i-lucide-maximize-2"
              size="xs"
              variant="ghost"
              color="neutral"
            >
              {{ t('chat.full') }}
            </UButton>
          </div>
          <iframe
            :key="pdfSrc"
            :src="pdfSrc"
            class="flex-1 w-full bg-white"
            title="Rulebook PDF"
          />
        </div>

        <!-- Chat view -->
        <div
          v-show="view === 'chat'"
          class="flex-1 min-h-0 flex flex-col"
        >
          <div
            v-if="!ready"
            class="flex-1 grid place-items-center text-sm text-muted p-4 text-center"
          >
            {{ t('chat.notReady') }}
          </div>
          <template v-else>
            <div
              ref="scroller"
              class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3"
            >
              <div
                v-if="!chat.messages.length"
                class="text-center text-muted text-sm py-6 space-y-3"
              >
                <p>{{ t('chat.askAnything') }}</p>
                <div class="flex flex-col gap-2">
                  <UButton
                    v-for="s in suggestions"
                    :key="s"
                    variant="soft"
                    color="neutral"
                    size="xs"
                    block
                    @click="
                      input = s;
                      send();
                    "
                  >
                    {{ s }}
                  </UButton>
                </div>
              </div>

              <div
                v-for="message in chat.messages"
                :key="message.id"
                class="flex"
                :class="
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                "
              >
                <div
                  class="rounded-lg px-3 py-2 max-w-[90%] text-sm"
                  :class="
                    message.role === 'user'
                      ? 'bg-primary text-inverted'
                      : 'bg-elevated'
                  "
                >
                  <MarkdownBlock
                    v-if="message.role === 'assistant'"
                    :source="textOf(message)"
                  />
                  <p
                    v-else
                    class="whitespace-pre-wrap"
                  >
                    {{ textOf(message) }}
                  </p>
                  <div
                    v-if="citationsOf(message).length"
                    class="mt-2 flex flex-wrap gap-1"
                  >
                    <UButton
                      v-for="(c, i) in citationsOf(message)"
                      :key="i"
                      size="xs"
                      variant="outline"
                      color="neutral"
                      icon="i-lucide-file-text"
                      @click="c.page && openPage(c.page)"
                    >
                      {{ c.page ? t('chat.page', { page: c.page }) : c.title }}
                    </UButton>
                  </div>
                </div>
              </div>
            </div>

            <div class="p-3 border-t border-default">
              <div class="flex gap-2">
                <UInput
                  v-model="input"
                  :placeholder="t('chat.placeholder')"
                  class="flex-1"
                  :disabled="busy"
                  @keydown.enter="send"
                />
                <UButton
                  v-if="busy"
                  icon="i-lucide-square"
                  color="neutral"
                  square
                  @click="chat.stop()"
                />
                <UButton
                  v-else
                  icon="i-lucide-send"
                  square
                  :disabled="!input.trim()"
                  @click="send"
                />
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>
  </USlideover>
</template>
