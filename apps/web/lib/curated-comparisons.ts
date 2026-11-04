/**
 * The head-to-heads worth a page of their own: rivalries and teammates people
 * search for by name. Every other pairing stays on the `noindex`, uncached
 * `/compare/drivers?d1=&d2=` view, because any pair of ~900 drivers is a valid URL
 * and a cache entry per pair would be an unbounded number of ISR writes. This
 * list is the bound: add a pair here to give it a cached, indexable page.
 *
 * Refs are f1db's, and every one was checked against the live API.
 */
export interface CuratedPair {
  a: string
  b: string
  label: string
}

const pair = (a: string, b: string, label: string): CuratedPair => ({ a, b, label })

export const CURATED_DRIVER_PAIRS: readonly CuratedPair[] = [
  pair('lewis-hamilton', 'max-verstappen', 'Hamilton vs Verstappen'),
  pair('michael-schumacher', 'lewis-hamilton', 'Schumacher vs Hamilton'),
  pair('ayrton-senna', 'alain-prost', 'Senna vs Prost'),
  pair('max-verstappen', 'lando-norris', 'Verstappen vs Norris'),
  pair('lando-norris', 'oscar-piastri', 'Norris vs Piastri'),
  pair('max-verstappen', 'charles-leclerc', 'Verstappen vs Leclerc'),
  pair('lewis-hamilton', 'nico-rosberg', 'Hamilton vs Rosberg'),
  pair('lewis-hamilton', 'fernando-alonso', 'Hamilton vs Alonso'),
  pair('lewis-hamilton', 'sebastian-vettel', 'Hamilton vs Vettel'),
  pair('lewis-hamilton', 'george-russell', 'Hamilton vs Russell'),
  pair('lewis-hamilton', 'charles-leclerc', 'Hamilton vs Leclerc'),
  pair('lewis-hamilton', 'lando-norris', 'Hamilton vs Norris'),
  pair('lewis-hamilton', 'ayrton-senna', 'Hamilton vs Senna'),
  pair('lewis-hamilton', 'jenson-button', 'Hamilton vs Button'),
  pair('lewis-hamilton', 'valtteri-bottas', 'Hamilton vs Bottas'),
  pair('lewis-hamilton', 'felipe-massa', 'Hamilton vs Massa'),
  pair('lewis-hamilton', 'kimi-raikkonen', 'Hamilton vs Räikkönen'),
  pair('max-verstappen', 'sergio-perez', 'Verstappen vs Pérez'),
  pair('max-verstappen', 'daniel-ricciardo', 'Verstappen vs Ricciardo'),
  pair('max-verstappen', 'george-russell', 'Verstappen vs Russell'),
  pair('max-verstappen', 'oscar-piastri', 'Verstappen vs Piastri'),
  pair('max-verstappen', 'sebastian-vettel', 'Verstappen vs Vettel'),
  pair('max-verstappen', 'fernando-alonso', 'Verstappen vs Alonso'),
  pair('max-verstappen', 'michael-schumacher', 'Verstappen vs Schumacher'),
  pair('max-verstappen', 'ayrton-senna', 'Verstappen vs Senna'),
  pair('charles-leclerc', 'carlos-sainz-jr', 'Leclerc vs Sainz'),
  pair('lando-norris', 'charles-leclerc', 'Norris vs Leclerc'),
  pair('lando-norris', 'george-russell', 'Norris vs Russell'),
  pair('oscar-piastri', 'charles-leclerc', 'Piastri vs Leclerc'),
  pair('george-russell', 'kimi-antonelli', 'Russell vs Antonelli'),
  pair('sebastian-vettel', 'mark-webber', 'Vettel vs Webber'),
  pair('sebastian-vettel', 'fernando-alonso', 'Vettel vs Alonso'),
  pair('sebastian-vettel', 'kimi-raikkonen', 'Vettel vs Räikkönen'),
  pair('fernando-alonso', 'kimi-raikkonen', 'Alonso vs Räikkönen'),
  pair('fernando-alonso', 'felipe-massa', 'Alonso vs Massa'),
  pair('michael-schumacher', 'ayrton-senna', 'Schumacher vs Senna'),
  pair('michael-schumacher', 'mika-hakkinen', 'Schumacher vs Häkkinen'),
  pair('michael-schumacher', 'fernando-alonso', 'Schumacher vs Alonso'),
  pair('michael-schumacher', 'sebastian-vettel', 'Schumacher vs Vettel'),
  pair('michael-schumacher', 'damon-hill', 'Schumacher vs Hill'),
  pair('michael-schumacher', 'rubens-barrichello', 'Schumacher vs Barrichello'),
  pair('michael-schumacher', 'kimi-raikkonen', 'Schumacher vs Räikkönen'),
  pair('mika-hakkinen', 'david-coulthard', 'Häkkinen vs Coulthard'),
  pair('jacques-villeneuve', 'damon-hill', 'Villeneuve vs Hill'),
  pair('ayrton-senna', 'nigel-mansell', 'Senna vs Mansell'),
  pair('ayrton-senna', 'nelson-piquet', 'Senna vs Piquet'),
  pair('nigel-mansell', 'nelson-piquet', 'Mansell vs Piquet'),
  pair('alain-prost', 'niki-lauda', 'Prost vs Lauda'),
  pair('niki-lauda', 'james-hunt', 'Lauda vs Hunt'),
  pair('gilles-villeneuve', 'didier-pironi', 'Villeneuve vs Pironi'),
  pair('jackie-stewart', 'emerson-fittipaldi', 'Stewart vs Fittipaldi'),
  pair('jim-clark', 'jackie-stewart', 'Clark vs Stewart'),
  pair('jim-clark', 'graham-hill', 'Clark vs Hill'),
  pair('juan-manuel-fangio', 'alberto-ascari', 'Fangio vs Ascari'),
  pair('juan-manuel-fangio', 'stirling-moss', 'Fangio vs Moss'),
  pair('juan-manuel-fangio', 'jim-clark', 'Fangio vs Clark'),
]

export const CURATED_CONSTRUCTOR_PAIRS: readonly CuratedPair[] = [
  pair('ferrari', 'mclaren', 'Ferrari vs McLaren'),
  pair('mercedes', 'red-bull', 'Mercedes vs Red Bull'),
  pair('ferrari', 'mercedes', 'Ferrari vs Mercedes'),
  pair('ferrari', 'red-bull', 'Ferrari vs Red Bull'),
  pair('mclaren', 'red-bull', 'McLaren vs Red Bull'),
  pair('mclaren', 'mercedes', 'McLaren vs Mercedes'),
  pair('ferrari', 'williams', 'Ferrari vs Williams'),
  pair('mclaren', 'williams', 'McLaren vs Williams'),
  pair('ferrari', 'lotus', 'Ferrari vs Lotus'),
  pair('ferrari', 'renault', 'Ferrari vs Renault'),
  pair('williams', 'benetton', 'Williams vs Benetton'),
  pair('aston-martin', 'alpine', 'Aston Martin vs Alpine'),
]

export type ComparisonKind = 'drivers' | 'constructors'

const pairsOf = (kind: ComparisonKind) =>
  kind === 'drivers' ? CURATED_DRIVER_PAIRS : CURATED_CONSTRUCTOR_PAIRS

export const pairSlug = ({ a, b }: CuratedPair) => `${a}-vs-${b}`

export const pairHref = (kind: ComparisonKind, p: CuratedPair) => `/compare/${kind}/${pairSlug(p)}`

export const findPair = (kind: ComparisonKind, slug: string) =>
  pairsOf(kind).find((p) => pairSlug(p) === slug)

/** The curated head-to-heads one driver or team appears in, most searched first. */
export const pairsFor = (kind: ComparisonKind, ref: string) =>
  pairsOf(kind).filter((p) => p.a === ref || p.b === ref)
