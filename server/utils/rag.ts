import { embed, embedMany } from 'ai'
import type { EmbeddingModel } from 'ai'

export interface RetrievedChunk {
  chunkId: number
  content: string
  page: number | null
  distance: number
}

export async function embedTexts(model: EmbeddingModel, values: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({ model, values })
  return embeddings
}

export async function embedText(model: EmbeddingModel, value: string): Promise<number[]> {
  const { embedding } = await embed({ model, value })
  return embedding
}

export function searchSimilar(
  gameId: string,
  dim: number,
  queryEmbedding: number[],
  k = 6
): RetrievedChunk[] {
  const table = ensureVecTable(dim)
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT v.chunk_id AS chunkId, v.distance AS distance,
              c.content AS content, c.page AS page
       FROM ${table} v
       JOIN chunks c ON c.id = v.chunk_id
       WHERE v.game_id = ? AND v.embedding MATCH ? AND k = ?
       ORDER BY v.distance`
    )
    .all(gameId, floatsToBlob(queryEmbedding), k) as RetrievedChunk[]
  return rows
}
