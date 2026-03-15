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
  headshotUrl: string | null
  url?: string
}

export interface Constructor {
  id: string
  ref: string
  name: string
  nationality: string | null
  countryCode: string | null
  color: string | null
  logoUrl: string | null
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

export interface Race {
  id: string
  seasonYear: number
  round: number
  name: string
  circuit: Circuit
  date: string
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
  stopNumber: number
  lap: number
  timeOfDay: string | null
  duration: string | null
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
    headshotUrl: string | null
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
  totalLaps: number
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
      headshotUrl: string | null
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
      headshotUrl: string | null
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
export interface PitStopAnalysis {
  raceId: string
  totalStops: number
  avgDuration: string | null
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
    stopCount: number
  }>
  distribution: Array<{ range: string; count: number }>
}

export interface StandingsProgressionDriver {
  ref: string
  code: string | null
  firstName: string
  lastName: string
  color: string | null
}

export interface StandingsProgressionResponse {
  year: number
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
  rounds: Record<string, number | string>[]
  constructors: ConstructorProgressionEntry[]
}
