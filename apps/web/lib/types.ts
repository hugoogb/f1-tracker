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

export interface QualifyingResult {
  id: string
  raceId: string
  driver: Driver
  constructor: Constructor
  position: number
  q1: string | null
  q2: string | null
  q3: string | null
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
