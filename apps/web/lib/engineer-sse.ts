export interface SseParser {
  push(chunk: string): void
  end(): void
}

/**
 * Incremental parser for the server's `event: <name>\ndata: <json>\n\n` stream.
 * Partial lines are buffered across chunks; an event is dispatched on each blank
 * line (or by `end()` if the stream stops mid-event). Comment lines (`:`),
 * events without a data line and data that is not JSON are ignored.
 */
export function createSseParser(onEvent: (event: string, data: unknown) => void): SseParser {
  let buffer = ''
  let eventName = 'message'
  let dataLines: string[] = []

  function dispatch() {
    const name = eventName
    const lines = dataLines
    eventName = 'message'
    dataLines = []
    if (lines.length === 0) return
    let data: unknown
    try {
      data = JSON.parse(lines.join('\n'))
    } catch {
      return
    }
    onEvent(name, data)
  }

  function line(raw: string) {
    if (raw === '') return dispatch()
    if (raw.startsWith(':')) return
    const colon = raw.indexOf(':')
    const field = colon === -1 ? raw : raw.slice(0, colon)
    let value = colon === -1 ? '' : raw.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') eventName = value
    else if (field === 'data') dataLines.push(value)
  }

  /**
   * Hand every complete line in the buffer to `line()`. A line ends at `\n`,
   * `\r\n` or a bare `\r` (all three are SSE line endings). A `\r` at the very
   * end of the buffer might be the first half of a `\r\n` split across chunks,
   * so it waits for the next chunk unless the stream has ended.
   */
  function drain(final: boolean) {
    let at = 0
    for (;;) {
      const lf = buffer.indexOf('\n', at)
      const cr = buffer.indexOf('\r', at)
      const end = cr === -1 ? lf : lf === -1 ? cr : Math.min(cr, lf)
      if (end === -1) break
      if (buffer[end] === '\r' && end === buffer.length - 1 && !final) break
      line(buffer.slice(at, end))
      at = end + (buffer[end] === '\r' && buffer[end + 1] === '\n' ? 2 : 1)
    }
    buffer = buffer.slice(at)
  }

  return {
    push(chunk) {
      buffer += chunk
      drain(false)
    },
    end() {
      drain(true)
      if (buffer !== '') {
        line(buffer)
        buffer = ''
      }
      dispatch()
    },
  }
}
