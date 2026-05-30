import type { InjectionKey, Ref } from 'vue'
import type { Game } from '#shared/types'

// Provided by the games/[id].vue shell and consumed by the tab pages so they
// can read the game's status without re-fetching.
export const GAME_KEY = Symbol('grule-game') as InjectionKey<Ref<Game | null | undefined>>

export function useGameContext() {
  const game = inject(GAME_KEY, ref<Game | null | undefined>(null))
  const ready = computed(() => game.value?.status === 'ready')
  return { game, ready }
}
