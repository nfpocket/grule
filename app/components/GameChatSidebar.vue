<script setup lang="ts">
import { Chat } from "@ai-sdk/vue";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import type { ChatMessageRow, Citation } from "#shared/types";

const props = defineProps<{
  gameId: string;
  ready: boolean;
  initialMessages: ChatMessageRow[];
}>();
defineEmits<{ close: [] }>();

const view = ref<"chat" | "pdf">("chat");
const open = ref(false);
const pdfPage = ref<number | null>(null);
const pdfSrc = computed(
  () =>
    `/api/games/${props.gameId}/pdf${pdfPage.value ? `#page=${pdfPage.value}` : ""}`,
);

function openPage(page: number) {
  pdfPage.value = page;
  view.value = "pdf";
}

const seeded = props.initialMessages.map((m) => ({
  id: String(m.id),
  role: m.role,
  parts: [
    { type: "text", text: m.content },
    ...(m.citations?.length
      ? [{ type: "data-citations", data: m.citations }]
      : []),
  ],
}));

const chat = new Chat({
  transport: new DefaultChatTransport({
    api: `/api/games/${props.gameId}/chat`,
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: seeded as any,
});

const input = ref("");
const busy = computed(
  () => chat.status === "submitted" || chat.status === "streaming",
);

function send() {
  const text = input.value.trim();
  if (!text || busy.value) return;
  chat.sendMessage({ text });
  input.value = "";
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
}
function citationsOf(message: UIMessage): Citation[] {
  return message.parts
    .filter((p) => p.type === "data-citations")
    .flatMap((p) => (p as { data?: Citation[] }).data || []);
}

const scroller = ref<HTMLElement>();
watch(
  () => chat.messages.map((m) => textOf(m)).join(""),
  async () => {
    await nextTick();
    scroller.value?.scrollTo({ top: scroller.value.scrollHeight });
  },
);

const suggestions = [
  "How do I win?",
  "What happens on my turn?",
  "How is scoring calculated?",
];
</script>

<template>
  <USlideover
    :ui="{
      content: 'lg:w-[33vw] lg:min-w-[500px] max-w-none',
    }"
    v-model:open="open"
    :overlay="false"
    :modal="false"
  >
    <slot></slot>

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
            Chat
          </UButton>
          <UButton
            :color="view === 'pdf' ? 'primary' : 'neutral'"
            :variant="view === 'pdf' ? 'soft' : 'ghost'"
            icon="i-lucide-file-text"
            size="xs"
            @click="view = 'pdf'"
          >
            PDF
          </UButton>
        </div>
        <UButton
          icon="i-lucide-panel-right-close"
          color="neutral"
          variant="ghost"
          aria-label="Close sidebar"
          @click="open = false"
        />
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
            <span>{{ pdfPage ? `Page ${pdfPage}` : "Rulebook" }}</span>
            <UButton
              :to="`/games/${gameId}/pdf${pdfPage ? `?page=${pdfPage}` : ''}`"
              icon="i-lucide-maximize-2"
              size="xs"
              variant="ghost"
              color="neutral"
            >
              Full
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
        <div v-show="view === 'chat'" class="flex-1 min-h-0 flex flex-col">
          <div
            v-if="!ready"
            class="flex-1 grid place-items-center text-sm text-muted p-4 text-center"
          >
            Chat will be available once the rulebook has finished processing.
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
                <p>Ask anything about the rules.</p>
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
                  <p v-else class="whitespace-pre-wrap">
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
                      {{ c.page ? `Page ${c.page}` : c.title }}
                    </UButton>
                  </div>
                </div>
              </div>
            </div>

            <div class="p-3 border-t border-default">
              <div class="flex gap-2">
                <UInput
                  v-model="input"
                  placeholder="Ask about the rules…"
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
