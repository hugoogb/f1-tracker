type Prompts = [string, string, string]

const HOME: Prompts = [
  'Who is leading right now?',
  'When is the next race?',
  'Which season had the closest title fight?',
]
const SEASON: Prompts = [
  'Who can still win the title?',
  'Who won the most races this season?',
  'How did the championship battle unfold?',
]
const RACE: Prompts = [
  'Who gained the most places?',
  'How did the pit stop strategies differ?',
  'Who set the fastest lap?',
]
const DRIVER: Prompts = [
  'How many wins and poles does this driver have?',
  'How did this driver compare with their teammates?',
  'Which was their best season?',
]
const CONSTRUCTOR: Prompts = [
  'How many titles has this team won?',
  'Who are the team’s most successful drivers?',
  'Which was their best season?',
]
const CIRCUIT: Prompts = [
  'Who has won the most races here?',
  'Who has the most poles at this circuit?',
  'What happened at the most recent race here?',
]
const RECORDS: Prompts = [
  'Who has the most wins of all time?',
  'Which driver has the most poles?',
  'Who holds the most fastest laps?',
]
const BEST_SEASONS: Prompts = [
  'Which season had the closest title fight?',
  'Why does the top-ranked season score so high?',
  'Which recent season was the most competitive?',
]
const COMPARE: Prompts = [
  'Who has the better head-to-head record?',
  'Who has more wins and poles?',
  'How do their careers compare?',
]
const DEFAULT: Prompts = [
  'Who is leading the championship?',
  'Who has the most wins of all time?',
  'Which season had the closest title fight?',
]

/** Three starter questions for the page the reader is on, keyed by route pattern. */
export function suggestedPrompts(path: string): [string, string, string] {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  if (clean === '/') return [...HOME]
  if (/^\/seasons\/[^/]+\/races\/[^/]+$/.test(clean)) return [...RACE]
  if (/^\/seasons\/[^/]+\/compare$/.test(clean)) return [...COMPARE]
  if (/^\/seasons\/[^/]+$/.test(clean)) return [...SEASON]
  if (/^\/drivers\/[^/]+$/.test(clean)) return [...DRIVER]
  if (/^\/constructors\/[^/]+$/.test(clean)) return [...CONSTRUCTOR]
  if (/^\/circuits\/[^/]+$/.test(clean)) return [...CIRCUIT]
  if (clean === '/records') return [...RECORDS]
  if (clean === '/best-seasons') return [...BEST_SEASONS]
  if (clean === '/compare' || clean.startsWith('/compare/')) return [...COMPARE]
  return [...DEFAULT]
}
