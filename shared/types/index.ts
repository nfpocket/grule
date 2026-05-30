export type GameStatus = 'processing' | 'ready' | 'error'

export type ProviderId = 'anthropic' | 'openai' | 'lmstudio'
export type EmbeddingProviderId = 'openai' | 'lmstudio'

export interface ProviderSettings {
  chat: { provider: ProviderId, model: string }
  embedding: { provider: EmbeddingProviderId, model: string }
}

export interface GameMeta {
  players?: string
  playtime?: string
  ages?: string
  summary?: string
}

export type StepStatus = 'pending' | 'active' | 'done' | 'error'

export interface IngestStep {
  key: string
  label: string
  status: StepStatus
  detail?: string
}

export interface Game {
  id: string
  title: string
  slug: string
  status: GameStatus
  stage: string | null
  progress: number
  error: string | null
  embeddingProvider: string | null
  embeddingModel: string | null
  embeddingDim: number | null
  chatProvider: string | null
  chatModel: string | null
  meta: GameMeta | null
  steps: IngestStep[] | null
  createdAt: number
}

export interface Section {
  id: string
  gameId: string
  ord: number
  filename: string
  title: string
  content: string
}

export interface SetupStep {
  id: number
  gameId: string
  stepNo: number
  title: string
  body: string
  sectionRef: string | null
}

export interface Piece {
  id: number
  gameId: string
  name: string
  category: string | null
  quantity: string | null
  description: string
  sectionRef: string | null
}

export interface Citation {
  page?: number
  // legacy section-based citations (older chat history)
  sectionId?: string
  title?: string
}

export interface ChatMessageRow {
  id: number
  gameId: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[] | null
  createdAt: number
}
