<script setup lang="ts">
useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [{ rel: 'icon', href: '/favicon.ico' }],
  htmlAttrs: { lang: 'en' }
})

useSeoMeta({
  title: 'Grule — Board game rules assistant',
  description: 'Upload a board game rulebook and get an AI-powered chat, setup guide, and component reference.'
})
</script>

<template>
  <UApp>
    <UHeader>
      <template #left>
        <NuxtLink
          to="/"
          class="flex items-center gap-2 font-bold text-lg"
        >
          <UIcon
            name="i-lucide-dices"
            class="size-6 text-primary"
          />
          <span>Grule</span>
        </NuxtLink>
      </template>

      <template #right>
        <UButton
          to="/"
          icon="i-lucide-library"
          color="neutral"
          variant="ghost"
          label="Library"
        />
        <UButton
          to="/settings"
          icon="i-lucide-settings"
          color="neutral"
          variant="ghost"
          label="Settings"
        />
        <UColorModeButton />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>
  </UApp>
</template>
