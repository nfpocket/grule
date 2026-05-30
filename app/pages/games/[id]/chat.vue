<script setup lang="ts">
import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import type { ChatMessageRow, Citation } from '#shared/types'

const route = useRoute()
const id = route.params.id as string

const { data: history } = await useFetch<ChatMessageRow[]>(() => `/api/games/${id}/messages`)

const initialMessages = (history.value || []).map(m => ({
  id: String(m.id),
  role: m.role,
  parts: [
    { type: 'text', text: m.content },
    ...(m.citations?.length ? [{ type: 'data-citations', data: m.citations }] : [])
  ]
}))

const chat = new Chat({
  transport: new DefaultChatTransport({ api: `/api/games/${id}/chat` }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: initialMessages as any
})

const input = ref('')
const busy = computed(() => chat.status === 'submitted' || chat.status === 'streaming')

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
watch(() => chat.messages.map(m => textOf(m)).join(''), async () => {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
})

const suggestions = [
  'How do I win the game?',
  'What happens on my turn?',
  'How is scoring calculated?'
]
</script>

<template>
  <GameShell v-slot="{ ready }">
    <div
      v-if="!ready"
      class="text-muted"
    >
      Chat will be available once the rulebook has finished processing.
    </div>
    <div
      v-else
      class="flex flex-col h-[calc(100vh-22rem)] min-h-100"
    >
      <div
        ref="scroller"
        class="flex-1 overflow-y-auto space-y-4 pr-1"
      >
        <div
          v-if="!chat.messages.length"
          class="text-center text-muted py-10 space-y-4"
        >
          <p>Ask anything about the rules. Try:</p>
          <div class="flex flex-wrap gap-2 justify-center">
            <UButton
              v-for="s in suggestions"
              :key="s"
              variant="soft"
              color="neutral"
              size="sm"
              @click="input = s; send()"
            >
              {{ s }}
            </UButton>
          </div>
        </div>

        <div
          v-for="message in chat.messages"
          :key="message.id"
          class="flex"
          :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="rounded-lg px-4 py-2 max-w-[85%]"
            :class="message.role === 'user' ? 'bg-primary text-inverted' : 'bg-elevated'"
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
                v-for="c in citationsOf(message)"
                :key="c.sectionId"
                :to="`/games/${id}?section=${c.sectionId}`"
                size="xs"
                variant="outline"
                color="neutral"
                icon="i-lucide-book-marked"
              >
                {{ c.title }}
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <div class="pt-3 mt-2 border-t border-default">
        <div class="flex gap-2">
          <UInput
            v-model="input"
            placeholder="Ask about the rules…"
            class="flex-1"
            size="lg"
            :disabled="busy"
            @keydown.enter="send"
          />
          <UButton
            v-if="busy"
            icon="i-lucide-square"
            color="neutral"
            size="lg"
            @click="chat.stop()"
          >
            Stop
          </UButton>
          <UButton
            v-else
            icon="i-lucide-send"
            size="lg"
            :disabled="!input.trim()"
            @click="send"
          >
            Send
          </UButton>
        </div>
      </div>
    </div>
  </GameShell>
</template>
