export type TournamentMode = 'MINI' | 'CORE' | 'MAJOR';

export interface Player {
  id: string;
  name: string;
  phone: string;
  email: string;
  duprId: string;
  jerseyNumber: string;
  rank: number;
  points: number;
  pointDiff: number;
  pointsScored: number;
  podWins: number;
  lastRank?: number;
}

export interface Match {
  id: string;
  playerIds: [string, string, string, string]; // [team1_p1, team1_p2, team2_p1, team2_p2]
  score1: number;
  score2: number;
  status: 'PENDING' | 'LOCKED';
}

export interface Pod {
  id: string;
  courtName: string;
  podName: string; // 'A' or 'B'
  playerIds: string[]; // 4 players
  matches: Match[];
  status: 'PENDING' | 'LOCKED';
}

export interface Round {
  id: string;
  number: number;
  type: 'SEEDING' | 'LADDER';
  pods: Pod[];
  status: 'PENDING' | 'LOCKED';
}

export interface PlayoffTeam {
  id: string;
  captainId: string;
  partnerId?: string;
  name: string;
}

export interface PlayoffMatch {
  id: string;
  team1Id: string;
  team2Id: string;
  score1: number;
  score2: number;
  status: 'PENDING' | 'LOCKED';
  stage: 'SEMIS' | 'FINALS';
}

export interface Tournament {
  id: string;
  name: string;
  mode: TournamentMode;
  players: Player[];
  rounds: Round[];
  status: 'SETUP' | 'SEEDING' | 'LADDER' | 'PLAYOFFS' | 'FINISHED';
  currentRoundIndex: number;
  playoffTeams: PlayoffTeam[];
  playoffMatches: PlayoffMatch[];
}

export interface ServerState {
  tournament: Tournament | null;
}
