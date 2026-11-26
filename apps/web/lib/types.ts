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
  grid: number | null
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
  constructor: Constructor | null
  points: number
  position: number | null
  wins: number
}

export interface ConstructorStanding {
  constructor: Constructor
  points: number
  position: number | null
  wins: number
}

type ChampionTeam = Pick<Constructor, 'id' | 'ref' | 'name' | 'color'>

export interface SeasonChampion {
  year: number
  driver: Pick<Driver, 'id' | 'ref' | 'firstName' | 'lastName'>
  constructor: ChampionTeam | null
  driverConstructor: ChampionTeam | null
  driverPoints: number
  constructorPoints: number | null
}

export interface SprintResult {
  position: number | null
  positionText: string
  grid: number | null
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
  duration: string | null
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

export interface ChartDriverLaps {
  driver: Pick<Driver, 'ref' | 'code' | 'firstName' | 'lastName' | 'countryCode'>
  constructor: Pick<Constructor, 'ref' | 'name' | 'color'>
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
  era?: string
  yearFrom?: number
  yearTo?: number
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
  value: number
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
  note: string
  data: RecordsExploreRow[]
  total: number
  page: number
  pageSize: number
}

export interface RadarStats {
  winRate: number
  podiumRate: number
  poleRate: number
  pointsPerRace: number
  fastestLapRate: number
}

export interface DriverPositions {
  driver: { id: string; ref: string; code: string | null; firstName: string; lastName: string }
  constructor: { ref: string; name: string; color: string | null }
  positions: Array<{ lap: number; position: number }>
}

export interface PositionsResponse {
  raceId: string
  totalLaps: number
  coveredLaps: number
  drivers: DriverPositions[]
}

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
  constructorRef: string | null
  color: string | null
}

export interface StandingsProgressionResponse {
  year: number
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

export interface DriverGap {
  lap: number
  gapMs: number
}

export interface DriverGaps {
  driver: Driver
  constructor: Constructor
  gaps: DriverGap[]
}

export interface GapsResponse {
  raceId: string
  totalLaps: number
  coveredLaps: number
  drivers: DriverGaps[]
}

export interface DegradationPoint {
  tyreLife: number
  medianMs: number
  sampleSize: number
}

export interface CompoundDegradation {
  compound: string
  laps: number
  degradationMsPerLap: number | null
  points: DegradationPoint[]
}

export interface DegradationResponse {
  raceId: string
  compounds: CompoundDegradation[]
  totalLaps: number
  cleanLaps: number
  thresholdMs: number | null
}

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
  yearTo: number | null
  isCurrent: boolean
  stats: LineageStats
}

export interface LineageResponse {
  constructor: Constructor
  lineageRef: string | null
  entries: LineageEntry[]
}

interface TitleContenderBase {
  position: number | null
  points: number
  wins: number
  maxPossible: number
  deficit: number
  alive: boolean
  onlyOnCountback: boolean
  isLeader: boolean
}

export interface TitleContender extends TitleContenderBase {
  driver: Driver
}

export interface ConstructorTitleContender extends TitleContenderBase {
  constructor: Constructor
}

export interface PermutationsResponse<C = TitleContender> {
  year: number
  kind?: 'drivers' | 'constructors'
  started: boolean
  decided: boolean
  seasonComplete?: boolean
  roundsRun: number
  totalRounds: number
  racesRemaining?: number
  sprintsRemaining?: number
  sprintScheduleKnown?: boolean
  doublePointsFinale?: boolean
  maxRemaining?: number
  pointsSystem?: PointsSystem
  nextRound?: { round: number; name: string } | null
  canClinchNextRound?: boolean
  marginToClinch?: number
  aliveCount?: number
  contenders: C[]
}

export type ConstructorPermutationsResponse = PermutationsResponse<ConstructorTitleContender>

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
  positionDelta: number | null
}

export interface NormalisedStandingsResponse {
  year: number
  system: PointsSystem
  actualSystem: PointsSystem
  isActualSystem: boolean
  championChanged: boolean
  sprintsCounted: number
  standings: NormalisedStanding[]
}

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
    scored: number
    counted: number
    dropped: number
  }
}

export interface SeasonScoring {
  system: SeasonPointsSystem
  everyResultCounts: boolean
  droppedPoints: DroppedPoints | null
}

export interface OpsCoverage {
  firstSeason: number | null
  lastSeason: number | null
  totalRaces: number
  racesWithResults: number
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
  need: ('laps' | 'quali_sectors')[]
}

export interface OpsFastF1 {
  backlog: number
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
  failed: boolean
}

export interface OpsIngest {
  available: boolean
  runs: OpsIngestRun[]
  lastSuccessAt: string | null
}

export interface OpsChat {
  enabled: boolean
  requestsToday: number
  costTodayUsd: number
  budgetUsd: number
  toolShare: number | null
  errorsToday: number
}

export interface OpsStatus {
  generatedAt: string
  coverage: OpsCoverage
  fastf1: OpsFastF1
  rowCounts: Record<string, number>
  estimatedCounts: string[]
  ingest: OpsIngest
  schemaVersion: string | null
  chat?: OpsChat
}

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
  finish?: number | null
  positionText?: string | null
  grid?: number | null
  qualifying?: number | null
  constructor?: SeasonCompareTeam | null
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
  cumulativeSource: 'official' | 'scored'
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

export interface CalendarRound {
  round: number
  name: string
  date: string | null
  schedule: RaceSchedule
  circuit: {
    ref: string
    name: string
    location: string | null
    country: string | null
    countryCode: string | null
    latitude: number | null
    longitude: number | null
    layoutSvgId: string | null
  }
  winner: {
    driver: { ref: string; code: string | null; firstName: string; lastName: string }
    constructor: { id: string; ref: string; name: string; color: string | null } | null
  } | null
  legKm: number | null
}

export interface SeasonCalendarResponse {
  year: number
  totalKm: number
  rounds: CalendarRound[]
}

export interface BestSeasonComponentInfo {
  id: string
  label: string
  weight: number
  description: string
}

export interface BestSeasonComponent {
  id: string
  label: string
  weight: number
  value: number
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
  constructor: BestSeasonTeam | null
  points: number
}

export interface BestSeason {
  year: number
  rank: number | null
  inProgress: boolean
  totalRounds: number
  roundsRun: number
  pointsSystem: { id: string; label: string; era: string }
  everyResultCounts: boolean
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
