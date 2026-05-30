export interface TextChunk {
  ord: number
  content: string
}

/**
 * Heading-aware greedy chunker. Accumulates paragraphs up to ~maxChars,
 * breaking on blank lines, and prefixes each chunk with the nearest heading
 * so retrieved fragments keep their context.
 */
export function chunkMarkdown(markdown: string, maxChars = 2000): TextChunk[] {
  const lines = markdown.split('\n')
  const chunks: TextChunk[] = []
  let currentHeading = ''
  let buf: string[] = []
  let bufLen = 0
  let ord = 0

  const flush = () => {
    const body = buf.join('\n').trim()
    if (!body) {
      buf = []
      bufLen = 0
      return
    }
    const prefix = currentHeading && !body.startsWith(currentHeading) ? `${currentHeading}\n\n` : ''
    chunks.push({ ord: ord++, content: `${prefix}${body}`.trim() })
    buf = []
    bufLen = 0
  }

  for (const line of lines) {
    const isHeading = /^#{1,6}\s/.test(line)
    if (isHeading) {
      flush()
      currentHeading = line.trim()
      continue
    }
    if (bufLen + line.length > maxChars && bufLen > 0) flush()
    buf.push(line)
    bufLen += line.length + 1
  }
  flush()

  return chunks.filter(c => c.content.length > 0)
}
