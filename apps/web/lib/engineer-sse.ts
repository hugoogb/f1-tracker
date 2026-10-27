export interface SseParser {
  push(chunk: string): void
  end(): void
}

/**
 * Incremental parser for the server's `event: <name>\ndata: <json>\n\n` stream.
 * Partial lines are buffered across chunks; an event is dispatched on each blank
 * line (or by `end()` if the stream stops mid-event). Comment lines (`:`) and
 * events without a data line are ignored.
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

  return {
    push(chunk) {
      buffer += chunk
      let nl = buffer.indexOf('\n')
      while (nl !== -1) {
        const raw = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        line(raw.endsWith('\r') ? raw.slice(0, -1) : raw)
        nl = buffer.indexOf('\n')
      }
    },
    end() {
      if (buffer !== '') {
        line(buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer)
        buffer = ''
      }
      dispatch()
    },
  }
}
