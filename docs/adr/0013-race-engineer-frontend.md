# 0013 — Race Engineer frontend

The chat sidebar in `apps/web`. The backend is ADR 0017; the limits and privacy rules are in `CLAUDE.md`.

### The sidebar stays mounted across navigation

Where: `apps/web/components/engineer/engineer-sheet.tsx` — `EngineerSheet`

The header keeps the sheet mounted once opened, so a link in an answer navigates the page underneath without losing the conversation. Unmounting it per route would reset the transcript view and focus.

### The composer waits out a refusal

Where: `apps/web/components/engineer/engineer-sheet.tsx` — `held`

While the status is cooldown or budget the composer is held, because a retry would be refused again and, for a cooldown, would count against the same rate-limit window.

### Input focus returns on the busy-to-idle edge

Where: `apps/web/components/engineer/engineer-sheet.tsx` — `wasBusy` effect

The input is disabled while an answer streams, which drops its focus, so the effect refocuses it only on the busy-to-idle transition. Opening is handled by the sheet's `initialFocus`, so focusing on every change would fight it.

### Cmd/Ctrl+J yields to page fields but still closes the sheet

Where: `apps/web/components/engineer/engineer-button.tsx` — keydown handler

The shortcut is ignored when focus is in a text field elsewhere on the page, since the keystroke belongs to that field. From the sheet's own composer it must still close the sheet.

### Cooldown matches the server's rate window

Where: `apps/web/lib/use-engineer.ts` — `COOLDOWN_MS`

A 429 holds the composer for as long as the server's per-IP window (`RATE_WINDOW`, 10 minutes in `pipeline/src/chat/gates.py`). Every refused request is a ledger row that counts against the window, so retrying sooner only extends the reader's own lockout; the two values change together.

### An unacceptable page path is sent as the root

Where: `apps/web/lib/use-engineer.ts` — `pagePath`

The server accepts only a plain site path (no percent-encoding, `~`, `+`), so any other path is sent as `/`. Otherwise every question asked on that page would be refused with a 422.

### Feedback lands on the right ledger row

Where: `apps/web/lib/use-engineer.ts` — `reduce` (`done` case)

The ledger id from `done` is attached to this stream's answer message only. A turn that wrote no text gets a notice message in its place, so it is not silent and its thumbs still reach the right ledger row; a failed turn adds nothing.

### Incomplete markup stays plain text while streaming

Where: `apps/web/lib/engineer-markdown.ts` — `tokenizeAnswer`

The answer is re-tokenised on every streamed delta, and a link or bold span that is not yet complete stays plain text, so partial markup never flashes as a broken element. A bold span may wrap links, which come out as bold link tokens.

### SSE parser holds a trailing carriage return

Where: `apps/web/lib/engineer-sse.ts` — `drain`

A line ends at `\n`, `\r\n` or a bare `\r`, all valid SSE endings. A `\r` at the very end of the buffer may be the first half of a `\r\n` split across chunks, so it waits for the next chunk unless the stream has ended.

### An API without a chat section reads as off

Where: `apps/web/lib/engineer-status.ts` — `formatEngineerStatus`

An API deployed before the Engineer existed sends no `chat` key, which the status page treats the same as chat being off.

### SSE parsing is forgiving

Where: `apps/web/lib/engineer-sse.ts` — `createSseParser`

Partial lines are buffered across chunks and an event dispatches on each blank line, or on `end()` if the stream stops mid-event. Comment lines (`:`), events with no data line and data that is not JSON are ignored rather than failing the answer.

### A second Enter cannot send twice

Where: `apps/web/lib/use-engineer.ts` — `sendBlocked`

`sendBlocked` checks an in-flight flag as well as the status, because a double Enter can fire before the first dispatch has changed the status.
