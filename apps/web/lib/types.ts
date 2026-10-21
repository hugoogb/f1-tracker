export interface Season {
  year: number
  url?: string
}

export interface Driver {
  id: string
  ref: string
  number: number | null
  code: string | null
  firstName: string
  lastName: string
  dateOfBirth: string | null
  nationality: string | null
  countryCode: string | null
  url?: string
}

export interface Constructor {
  id: string
  ref: string
  name: string
  nationality: string | null
  countryCode: string | null
  color: string | null
  url?: string
}

export interface Circuit {
  id: string
  ref: string
  name: string
  location: string | null
  country: string | null
  countryCode: string | null
  latitude: number | null
  longitude: number | null
  url?: string
}

export interface CircuitLayout {
  layoutNumber: number
  svgId: string
  seasonsActive: string
}

/**
 * Session start times for a race weekend, as UTC instants.
 *
 * f1db only schedules the seasons around the present day, so every field is
 * null for a historic race — `hasSchedule` in `lib/schedule.ts` is the check.
 */
export interface RaceSchedule {
  fp1: string | null
  fp2: string | null
  fp3: string | null
  sprintQualifying: string | null
  sprintRace: string | null
  qualifying: string | null
  race: string | null
}

export interface Race {
  id: string
  seasonYear: number
  round: number
  name: string
  circuit: Circuit
  date: string
  schedule?: RaceSchedule
  url?: string
}

export interface RaceResult {
  id: string
  raceId: string
  driver: Driver
  constructor: Constructor
  grid: number
  position: number | null
  positionText: string
  points: number
  laps: number
  time: string | null
  fastestLapTime: string | null
  status: string
}

export interface QualifyingSectorTimes {
  s1Ms: number | null
  s2Ms: number | null
  s3Ms: number | null
}

export interface QualifyingResult {
  id: string
  raceId: string
  driver: Driver
  constructor: Constructor
  position: number
  q1: string | null
  q2: string | null
  q3: string | null
  sectors: {
    q1: QualifyingSectorTimes
    q2: QualifyingSectorTimes
    q3: QualifyingSectorTimes
  } | null
}

export interface FastestLap {
  lapNumber: number | null
  time: string | null
  speed: string | null
  driver: {
    ref: string
    code: string | null
    firstName: string
    lastName: string
  }
  constructor: {
    ref: string
    name: string
    color: string | null
  } | null
}

export interface FastestSectorEntry {
  timeMs: number
  driver: {
    ref: string
    code: string | null
    firstName: string
    lastName: string
  }
}

export interface CircuitLapRecord {
  time: string | null
  speed: string | null
  year: number
  driver: { ref: string; firstName: string; lastName: string }
  constructor: { ref: string; name: string; color: string | null } | null
}

export interface FastestSectors {
  s1: FastestSectorEntry | null
  s2: FastestSectorEntry | null
  s3: FastestSectorEntry | null
}

export interface DriverStanding {
  driver: Driver
  constructor: Constructor
  points: number
  position: number
  wins: number
}

export interface ConstructorStanding {
  constructor: Constructor
  points: number
  position: number
  wins: number
}

export interface DriverCareerStats {
  driver: Driver
  totalRaces: number
  wins: number
  podiums: number
  poles: number
  fastestLaps: number
  championships: number
  totalPoints: number
}

export interface SeasonChampion {
  year: number
  driver: Driver
  constructor: Constructor
  driverPoints: number
  constructorPoints: number
}

export interface SprintResult {
  position: number | null
  positionText: string
  grid: number
  points: number
  laps: number
  time: string | null
  status: string
  driver: Driver
  constructor: Constructor
}

export interface PitStop {
  driver: Driver
  constructor: Constructor | null
  stopNumber: number
  lap: number
  /** Pit lane time in seconds — entry line to exit line, stationary included. */
  duration: string | null
  /** Seconds off the quickest pit lane time of the same race. */
  timeLost: string | null
}

export interface DriverSeasonSummary {
  year: number
  constructor: Constructor | null
  races: number
  wins: number
  podiums: number
  points: number
  championshipPosition: number | null
}

export interface ConstructorSeasonSummary {
  year: number
  races: number
  wins: number
  podiums: number
  points: number
  championshipPosition: number | null
}

export interface LapData {
  lapNumber: number
  timeMs: number | null
  sector1Ms: number | null
  sector2Ms: number | null
  sector3Ms: number | null
  compound: string | null
  stint: number | null
  tyreLife: number | null
}

export interface DriverLaps {
  driver: Driver
  constructor: Constructor
  laps: LapData[]
}

export interface LapsResponse {
  raceId: string
  drivers: DriverLaps[]
}

/**
 * What the lap-time and tyre-strategy charts actually read from `DriverLaps`.
 *
 * The race page trims the `/laps` response down to this before handing it to
 * those client components (see `chartLaps` there). Everything passed to a
 * client component is serialised into the page twice — once in the RSC
 * payload, once inlined in the HTML — and the page is stored that way in the
 * ISR cache, so sector splits, stint numbers and tyre life nobody draws were
 * the largest part of every 2018+ race page.
 */
export interface ChartDriverLaps {
  driver: Pick<Driver, 'ref' | 'code' | 'lastName'>
  constructor: Pick<Constructor, 'color'>
  laps: Pick<LapData, 'lapNumber' | 'timeMs' | 'compound'>[]
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface DriverRecordEntry {
  driver: {
    ref: string
    code: string | null
    firstName: string
    lastName: string
    nationality: string | null
    countryCode: string | null
  }
  count: number
}

export interface ConstructorRecordEntry {
  constructor: {
    ref: string
    name: string
    nationality: string | null
    countryCode: string | null
    color: string | null
  }
  count: number
}

export interface RecordsResponse {
  drivers: {
    mostWins: DriverRecordEntry[]
    mostPodiums: DriverRecordEntry[]
    mostPoles: DriverRecordEntry[]
    mostStarts: DriverRecordEntry[]
    mostChampionships: DriverRecordEntry[]
    mostFastestLaps: DriverRecordEntry[]
  }
  constructors: {
    mostWins: ConstructorRecordEntry[]
    mostChampionships: ConstructorRecordEntry[]
  }
}

// Records explorer — the filterable view of the same data the tables above show.

export type RecordsExploreEntity = 'driver' | 'constructor'

export type RecordsExploreCategory =
  | 'wins'
  | 'poles'
  | 'podiums'
  | 'fastest_laps'
  | 'starts'
  | 'championships'
  | 'points'
  | 'win_rate'
  | 'podium_rate'

export interface RecordsExploreParams {
  entity: RecordsExploreEntity
  category: RecordsExploreCategory
  /** A points-system id; shorthand for the seasons it was in force. */
  era?: string
  yearFrom?: number
  yearTo?: number
  /** Driver nationality, or constructor nationality — whichever the entity is. */
  nationality?: string
  minStarts?: number
  sort?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export interface RecordsExploreRow {
  rank: number
  driver?: Driver
  constructor?: Constructor
  /** Counts as integers, points as a decimal, rates as a 0-1 fraction. */
  value: number
  /** Starts (drivers) or car entries (constructors), within the year range. */
  starts: number
}

export interface RecordsExploreResponse {
  entity: RecordsExploreEntity
  category: RecordsExploreCategory
  label: string
  format: 'integer' | 'decimal' | 'percent'
  era: { id: string; label: string; era: string } | null
  yearFrom: number | null
  yearTo: number | null
  nationality: string | null
  minStarts: number
  sort: 'asc' | 'desc'
  /** What the column means, written by the API so the UI cannot misstate it. */
  note: string
  data: RecordsExploreRow[]
  total: number
  page: number
  pageSize: number
}

// Driver Comparison
export interface RadarStats {
  winRate: number
  podiumRate: number
  poleRate: number
  pointsPerRace: number
  fastestLapRate: number
}

// Race Positions (lap-by-lap)
export interface DriverPositions {
  driver: { id: string; ref: string; code: string | null; firstName: string; lastName: string }
  constructor: { ref: string; name: string; color: string | null }
  positions: Array<{ lap: number; position: number }>
}

export interface PositionsResponse {
  raceId: string
  /** The race's real distance, from the results — the chart's x-axis. */
  totalLaps: number
  /** How far the reconstruction from lap times actually got. */
  coveredLaps: number
  drivers: DriverPositions[]
}

// Qualifying vs Race Pace
export interface DriverPaceSeason {
  year: number
  avgQualiPosition: number | null
  avgRacePosition: number | null
  qualiCount: number
  raceCount: number
  delta: number | null
}

export interface DriverPaceResponse {
  driverRef: string
  seasons: DriverPaceSeason[]
}

// Season Heatmap
export interface HeatmapDriverResult {
  round: number
  position: number | null
  positionText: string
  points: number
  status: string | null
}

export interface HeatmapDriver {
  driver: { ref: string; code: string | null; firstName: string; lastName: string }
  constructor: { ref: string; name: string; color: string | null }
  results: HeatmapDriverResult[]
}

export interface SeasonHeatmapResponse {
  year: number
  rounds: Array<{ round: number; name: string }>
  drivers: HeatmapDriver[]
}

// Circuit Stats
export interface CircuitStats {
  circuitRef: string
  mostWins: Array<{
    driver: {
      ref: string
      code: string | null
      firstName: string
      lastName: string
      countryCode: string | null
    }
    count: number
  }>
  mostPoles: Array<{
    driver: {
      ref: string
      code: string | null
      firstName: string
      lastName: string
      countryCode: string | null
    }
    count: number
  }>
  winningHistory: Array<{
    year: number
    round: number
    raceName: string
    winner: {
      driver: { ref: string; code: string | null; firstName: string; lastName: string }
      constructor: { ref: string; name: string; color: string | null }
    }
  }>
}

// Pit Stop Analysis
/**
 * Pit stop figures for one race, all in seconds.
 *
 * `duration` values are pit *lane* times, which are dominated by how long the
 * pit lane is; `timeLost` values are measured against `benchmark`, the quickest
 * pit lane time of the same race, and are what actually compares crews.
 */
export interface PitStopAnalysis {
  raceId: string
  totalStops: number
  benchmark: string | null
  avgDuration: string | null
  medianDuration: string | null
  avgTimeLost: string | null
  fastestStop: {
    driver: { ref: string; code: string | null; firstName: string; lastName: string }
    constructor: { ref: string; name: string; color: string | null } | null
    lap: number
    duration: string
    stopNumber: number
  } | null
  teamAverages: Array<{
    constructor: { ref: string; name: string; color: string | null }
    avgDuration: string
    bestDuration: string
    avgTimeLost: string
    stopCount: number
  }>
  distribution: Array<{ range: string; count: number }>
}

export interface StandingsProgressionDriver {
  ref: string
  code: string | null
  firstName: string
  lastName: string
  /** The team the driver last actually raced for — the line's colour. */
  constructorRef: string | null
  color: string | null
}

export interface StandingsProgressionResponse {
  year: number
  /**
   * `official`: the championship table after each round, which before 1991 is
   * points counted under the best-results rules. `scored`: race and sprint
   * points summed, the fallback when a round has no official table.
   */
  pointsSource?: 'official' | 'scored'
  rounds: Record<string, number | string>[]
  drivers: StandingsProgressionDriver[]
}

export interface ConstructorProgressionEntry {
  ref: string
  name: string
  color: string | null
}

export interface ConstructorProgressionResponse {
  year: number
  pointsSource?: 'official' | 'scored'
  rounds: Record<string, number | string>[]
  constructors: ConstructorProgressionEntry[]
}

// Gap to the leader, lap by lap
export interface DriverGap {
  lap: number
  /** Milliseconds behind whoever had the lowest elapsed time on that lap. */
  gapMs: number
}

export interface DriverGaps {
  driver: Driver
  constructor: Constructor
  gaps: DriverGap[]
}

export interface GapsResponse {
  raceId: string
  /** The race's real distance, from the results — the chart's x-axis. */
  totalLaps: number
  /** How far the reconstruction from lap times actually got. */
  coveredLaps: number
  drivers: DriverGaps[]
}

// Tyre degradation
export interface DegradationPoint {
  tyreLife: number
  medianMs: number
  sampleSize: number
}

export interface CompoundDegradation {
  compound: string
  /** Green-flag laps behind this compound's line, after the outlier filter. */
  laps: number
  /** Least-squares gradient; null when too few laps or a single tyre age. */
  degradationMsPerLap: number | null
  points: DegradationPoint[]
}

export interface DegradationResponse {
  raceId: string
  compounds: CompoundDegradation[]
  /** Laps with a compound and an age, before the outlier filter. */
  totalLaps: number
  /** How many survived it. */
  cleanLaps: number
  /** The cutoff itself, so the UI can say what was excluded. */
  thresholdMs: number | null
}

// Constructor lineages
export interface LineageStats {
  entries: number
  wins: number
  podiums: number
  points: number
  championships: number
}

export interface LineageEntry {
  constructor: Constructor
  yearFrom: number
  /** Null for the name still racing. */
  yearTo: number | null
  /** True for the constructor whose page this is. */
  isCurrent: boolean
  stats: LineageStats
}

export interface LineageResponse {
  constructor: Constructor
  /** Null when the team never changed its name, which is most of them. */
  lineageRef: string | null
  entries: LineageEntry[]
}

// Title permutations
export interface TitleContender {
  position: number | null
  driver: Driver
  points: number
  wins: number
  maxPossible: number
  deficit: number
  alive: boolean
  /** Can at best draw level, so the title would fall to a countback on wins. */
  onlyOnCountback: boolean
  isLeader: boolean
}

export interface PermutationsResponse {
  year: number
  started: boolean
  decided: boolean
  seasonComplete?: boolean
  roundsRun: number
  totalRounds: number
  racesRemaining?: number
  sprintsRemaining?: number
  sprintScheduleKnown?: boolean
  maxRemaining?: number
  pointsSystem?: PointsSystem
  nextRound?: { round: number; name: string } | null
  canClinchNextRound?: boolean
  marginToClinch?: number
  aliveCount?: number
  contenders: TitleContender[]
}

// Cross-era points normalisation
export interface PointsSystem {
  id: string
  label: string
  era: string
  racePoints: number[]
  sprintPoints: number[]
  fastestLapPoint: boolean
  fastestLapWithin: number
  notes: string
}

export interface PointsSystemsResponse {
  systems: PointsSystem[]
}

export interface NormalisedStanding {
  position: number
  driver: Driver
  points: number
  wins: number
  podiums: number
  officialPosition: number | null
  officialPoints: number | null
  /** Places gained against the official table; positive is a promotion. */
  positionDelta: number | null
}

export interface NormalisedStandingsResponse {
  year: number
  system: PointsSystem
  /** What the season was actually scored under. */
  actualSystem: PointsSystem
  isActualSystem: boolean
  championChanged: boolean
  sprintsCounted: number
  standings: NormalisedStanding[]
}

// How a season was scored
export interface SeasonPointsSystem {
  id: string
  label: string
  era: string
  notes: string
  fastestLapPoint: boolean
}

export interface DroppedPoints {
  driversAffected: number
  largest: {
    driver: Driver | null
    /** What the driver actually scored across the season. */
    scored: number
    /** What the championship kept. */
    counted: number
    dropped: number
  }
}

export interface SeasonScoring {
  system: SeasonPointsSystem
  /** False for 1950-1990, when only a driver's best results counted. */
  everyResultCounts: boolean
  /** Read off the results, not from a table of rules. Null when nothing dropped. */
  droppedPoints: DroppedPoints | null
}

// Operational status (/api/ops/status, rendered by /status)

export interface OpsCoverage {
  firstSeason: number | null
  lastSeason: number | null
  totalRaces: number
  racesWithResults: number
  /** The most recent round that has actually been raced, not the last on the calendar. */
  latestResult: { year: number; round: number; date: string | null } | null
  currentSeason: {
    year: number
    totalRounds: number
    roundsRun: number
    roundsRemaining: number
  } | null
  seasonInProgress: boolean
}

export interface OpsBacklogEntry {
  year: number
  round: number
  date: string | null
  /** Which Fast-F1 data is missing: `laps`, `quali_sectors`, or both. */
  need: string[]
}

export interface OpsFastF1 {
  backlog: number
  /** The oldest few outstanding races, as examples rather than the whole list. */
  oldest: OpsBacklogEntry[]
}

export type IngestRunStatus = 'running' | 'ok' | 'error'

export interface OpsIngestRun {
  target: string
  status: IngestRunStatus
  startedAt: string | null
  finishedAt: string | null
  rowsWritten: number | null
  f1dbVersion: string | null
  /**
   * A flag, never the message. The API deliberately withholds the exception
   * text — it can carry a connection string — so this is all there is to show.
   */
  failed: boolean
}

export interface OpsIngest {
  /** False on a database that predates the `ingest_runs` migration. */
  available: boolean
  runs: OpsIngestRun[]
  lastSuccessAt: string | null
}

export interface OpsStatus {
  generatedAt: string
  coverage: OpsCoverage
  fastf1: OpsFastF1
  rowCounts: Record<string, number>
  /**
   * Keys of `rowCounts` that are Postgres' `reltuples` statistic rather than a
   * real COUNT(*) — big tables where an exact scan is not worth its cost. The
   * page marks these, because a number that is sometimes exact and sometimes
   * approximate with nothing saying which is worse than either alone.
   */
  estimatedCounts: string[]
  ingest: OpsIngest
  schemaVersion: string | null
}

// ── In-season comparison (`/seasons/[year]/compare`) ────────────────────────
// Every delta is A minus B. For points that favours A when positive; for
// positions and lap times (lower is better) it favours A when negative.

export type SeasonCompareType = 'constructors' | 'drivers'

export interface SeasonCompareTeam {
  id: string
  ref: string
  name: string
  color: string | null
}

export interface SeasonComparePair {
  a: number | null
  b: number | null
  delta: number | null
}

export interface SeasonCompareHeadToHead {
  a: number
  b: number
  ties: number
  total: number
}

export interface SeasonCompareQualifyingGap {
  session: 'Q1' | 'Q2' | 'Q3'
  aMs: number
  bMs: number
  deltaMs: number
  deltaPct: number
}

export interface SeasonCompareRacePace {
  aMedianMs: number
  bMedianMs: number
  deltaMs: number
  deltaPct: number
  aCleanLaps: number
  bCleanLaps: number
}

export interface SeasonCompareCarResult {
  ref: string
  code: string | null
  lastName: string
  position: number | null
  positionText: string | null
  grid: number | null
}

export interface SeasonCompareRoundSide {
  entered: boolean
  points: number
  cumulativePoints: number
  lapsLed: number | null
  // Drivers
  finish?: number | null
  positionText?: string | null
  grid?: number | null
  qualifying?: number | null
  constructor?: SeasonCompareTeam | null
  // Constructors
  bestFinish?: number | null
  bestGrid?: number | null
  bestQualifying?: number | null
  drivers?: SeasonCompareCarResult[]
}

export interface SeasonCompareRound {
  round: number
  raceName: string
  a: SeasonCompareRoundSide
  b: SeasonCompareRoundSide
  pointsDelta: number | null
  cumulativeDelta: number | null
  finishDelta: number | null
  gridDelta: number | null
  qualifyingGap: SeasonCompareQualifyingGap | null
  racePace: SeasonCompareRacePace | null
  lapsLedCoverage: { coveredLaps: number; totalLaps: number } | null
}

export type SeasonCompareAggregateKey =
  | 'points'
  | 'starts'
  | 'wins'
  | 'podiums'
  | 'poles'
  | 'fastestLaps'
  | 'dnfs'
  | 'pointsFinishes'
  | 'averageGrid'
  | 'averageFinish'
  | 'lapsLed'

export interface SeasonCompareEntity {
  id: string
  ref: string
  name?: string
  firstName?: string
  lastName?: string
  code?: string | null
  color?: string | null
  constructor?: SeasonCompareTeam
  constructors?: SeasonCompareTeam[]
}

export interface SeasonCompareResponse {
  type: SeasonCompareType
  year: number
  a: SeasonCompareEntity
  b: SeasonCompareEntity
  pointsSource: 'official' | 'results'
  /** What `rounds[].cumulativePoints` follows: the official table after each round, or a sum. */
  cumulativeSource: 'official' | 'scored'
  /**
   * `championship` is the official total (or the summed one when there is no
   * official table); `scored` is every point awarded, which is what the
   * round-by-round line adds up; `dropped` is the difference, null without an
   * official table.
   */
  points: {
    championship: SeasonComparePair
    scored: SeasonComparePair
    dropped: SeasonComparePair | null
  }
  roundsRaced: number
  roundsShared: number
  rounds: SeasonCompareRound[]
  aggregates: Record<SeasonCompareAggregateKey, SeasonComparePair>
  headToHead: { race: SeasonCompareHeadToHead; qualifying: SeasonCompareHeadToHead }
  lapsLedCoverage: { roundsCovered: number; roundsRaced: number }
  qualifyingGap: {
    averageDeltaMs: number
    averageDeltaPct: number
    medianDeltaPct: number
    roundsCovered: number
    roundsShared: number
  } | null
  racePace: {
    averageDeltaMs: number
    averageDeltaPct: number
    roundsCovered: number
    roundsShared: number
    minCleanLaps: number
  } | null
  teammates?: {
    sameTeam: boolean
    sharedRounds: number
    constructor: SeasonCompareTeam | null
  }
}

export interface SeasonCompareEntrants {
  year: number
  drivers: {
    ref: string
    code: string | null
    firstName: string
    lastName: string
    position: number | null
    constructor: SeasonCompareTeam
  }[]
  constructors: (SeasonCompareTeam & { position: number | null })[]
}

/** One round of `/api/seasons/{year}/calendar`: where the circus went, and who won there. */
export interface CalendarRound {
  round: number
  name: string
  /** Calendar date (YYYY-MM-DD); null only for a malformed row. */
  date: string | null
  schedule: RaceSchedule
  circuit: {
    ref: string
    name: string
    location: string | null
    country: string | null
    countryCode: string | null
    /** Null when f1db has no coordinates — such a round is left off the map. */
    latitude: number | null
    longitude: number | null
    /** The `/tracks/<id>.svg` layout in use that year, if one is known. */
    layoutSvgId: string | null
  }
  /** Classified P1; null for a race not yet run. */
  winner: {
    driver: { ref: string; code: string | null; firstName: string; lastName: string }
    constructor: { id: string; ref: string; name: string; color: string | null } | null
  } | null
  /** Great-circle km from the previous round's circuit; null for round 1. */
  legKm: number | null
}

export interface SeasonCalendarResponse {
  year: number
  /** Sum of every `legKm` — the season's travel as the crow flies. */
  totalKm: number
  rounds: CalendarRound[]
}

// --- Best seasons (`/api/best-seasons`) -------------------------------------

export interface BestSeasonComponentInfo {
  id: string
  label: string
  /** Out of 100 across all components. */
  weight: number
  description: string
}

export interface BestSeasonComponent {
  id: string
  label: string
  weight: number
  /** 0-1, how fully the season met this component. */
  value: number
  /** `value * weight`: this component's share of the 0-100 total. */
  points: number
}

export interface BestSeasonTeam {
  id: string
  ref: string
  name: string
  color: string | null
}

export interface BestSeasonContender {
  driver: Pick<
    Driver,
    'id' | 'ref' | 'code' | 'firstName' | 'lastName' | 'nationality' | 'countryCode'
  >
  /** The team they raced for most that season, which is where their colour comes from. */
  constructor: BestSeasonTeam | null
  /** Official championship points. */
  points: number
}

export interface BestSeason {
  year: number
  /** Place by score among every completed season; null for the running one. */
  rank: number | null
  inProgress: boolean
  totalRounds: number
  roundsRun: number
  pointsSystem: { id: string; label: string; era: string }
  everyResultCounts: boolean
  /**
   * True only when a round had no official table and the walk fell back to
   * points scored — which, before 1991, is not the championship table.
   */
  progressionApproximate: boolean
  champion: BestSeasonContender | null
  runnerUp: BestSeasonContender | null
  titleMargin: number | null
  titleMarginShare: number | null
  titleMarginInWins: number | null
  decidedAtRound: number | null
  decidedAtRace: string | null
  decidedRoundsFromEnd: number | null
  wentToFinalRound: boolean | null
  contendersAtFinale: number | null
  distinctWinners: number
  distinctPoleSitters: number | null
  polesKnown: number
  leadChanges: number
  distinctLeaders: number
  constructors: {
    champion: BestSeasonTeam | null
    runnerUp: BestSeasonTeam | null
    championPoints: number
    runnerUpPoints: number
    margin: number
    marginShare: number | null
  } | null
  score: { total: number; components: BestSeasonComponent[] }
}

export interface BestSeasonsResponse {
  sort: string
  order: 'asc' | 'desc'
  era: { id: string; label: string; era: string } | null
  yearFrom: number | null
  yearTo: number | null
  total: number
  components: BestSeasonComponentInfo[]
  notes: string[]
  seasons: BestSeason[]
}

export interface BestSeasonResponse {
  rankedSeasons: number
  components: BestSeasonComponentInfo[]
  season: BestSeason
}
