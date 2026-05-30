import { mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'

let _db: Database.Database | null = null
let _dataDir: string | null = null

export function dataDir(): string {
  if (_dataDir) return _dataDir
  const cfg = useRuntimeConfig()
  _dataDir = resolve(process.cwd(), cfg.dataDir || './data')
  mkdirSync(_dataDir, { recursive: true })
  mkdirSync(join(_dataDir, 'games'), { recursive: true })
  return _dataDir
}

export function gameDir(gameId: string): string {
  const dir = join(dataDir(), 'games', gameId)
  mkdirSync(join(dir, 'sections'), { recursive: true })
  return dir
}

export function getDb(): Database.Database {
  if (_db) return _db
  const db = new Database(join(dataDir(), 'grule.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  sqliteVec.load(db)
  migrate(db)
  _db = db
  return _db
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      stage TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      pdf_path TEXT,
      embedding_provider TEXT,
      embedding_model TEXT,
      embedding_dim INTEGER,
      chat_provider TEXT,
      chat_model TEXT,
      meta TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      ord INTEGER NOT NULL,
      filename TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sections_game ON sections(game_id);

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL,
      ord INTEGER NOT NULL,
      content TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_game ON chunks(game_id);

    CREATE TABLE IF NOT EXISTS setup_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      step_no INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      section_ref TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_setup_game ON setup_steps(game_id);

    CREATE TABLE IF NOT EXISTS pieces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT,
      quantity TEXT,
      description TEXT NOT NULL,
      section_ref TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pieces_game ON pieces(game_id);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      citations TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_game ON chat_messages(game_id);
  `)
}

const _vecTables = new Set<string>()

/**
 * sqlite-vec virtual tables require a fixed dimension at creation time, and
 * different embedding models produce different dims. We lazily create one
 * partitioned vec0 table per dimension, keyed by game_id for fast filtering.
 */
export function ensureVecTable(dim: number): string {
  const name = `vec_chunks_${dim}`
  if (_vecTables.has(name)) return name
  const db = getDb()
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS ${name} USING vec0(
      chunk_id INTEGER PRIMARY KEY,
      game_id TEXT PARTITION KEY,
      embedding FLOAT[${dim}]
    )`
  )
  _vecTables.add(name)
  return name
}

export function floatsToBlob(values: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(values).buffer)
}
