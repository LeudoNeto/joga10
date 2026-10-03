export type Role = "admin" | "moderator" | "member";

export interface User {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface GroupSummary {
  id: number;
  name: string;
  description: string | null;
  role: Role;
  member_count: number;
  player_count: number;
  event_count: number;
  created_at: string;
  created_by: number;
  min_skill: number;
  max_skill: number;
}

export interface Member {
  user_id: number;
  name: string;
  email: string;
  role: Role;
  joined_at: string;
  is_creator: boolean;
  player_id: number | null; // player of the group that represents this member
  player_name: string | null;
  player_photo_url: string | null;
}

export interface GroupDetail extends GroupSummary {
  members: Member[];
}

export interface Invite {
  id: number;
  token: string;
  role: Role;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}

export interface InvitePreview {
  token: string;
  group_id: number;
  group_name: string;
  role: Role;
  valid: boolean;
  reason: string | null;
  already_member: boolean;
}

export interface Player {
  id: number;
  group_id: number;
  name: string;
  position: string | null;
  skill: number;
  active: boolean;
  created_at: string;
  photo_url: string | null;
  card_template: string | null;
}

export type ImportAction = "update" | "create" | "ignore";

export interface ParsedPlayerRow {
  name: string;
  skill: number;
  position: string | null;
  error: string | null;
  note: string | null;
  has_skill: boolean; // false: no nota in the input (default used)
  action: ImportAction; // compared by name with the group's players
  player_id: number | null;
  current_skill: number | null;
  reason: string | null;
}

export interface ImportPreview {
  rows: ParsedPlayerRow[]; // ordered: update, create, ignore
  total: number;
  valid: number;
  invalid: number;
  to_update: number;
  to_create: number;
  ignored: number;
}

export interface BulkResult {
  created: number;
  updated: number;
  ignored: number;
  players: Player[];
}

export type NameMatchStatus =
  | "matched"
  | "similar"
  | "ambiguous"
  | "not_found"
  | "duplicate";

export interface NameMatchRow {
  input: string;
  status: NameMatchStatus;
  player_id: number | null;
  candidates: { id: number; name: string }[];
}

export interface NameMatchResult {
  rows: NameMatchRow[];
  matched: number;
  pending: number;
}

export type DrawMode = "random" | "heuristic" | "optimal";

export interface EventItem {
  id: number;
  group_id: number;
  title: string;
  date: string;
  created_at: string;
  draw_mode: DrawMode | null;
  draw_proven: boolean;
  use_substitutes: boolean;
  wins_to_leave: number;
}

export interface TeamPlayer {
  id: number;
  name: string;
  position: string | null;
  skill: number;
  photo_url: string | null;
}

export interface TeamStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  streak: number;
}

export interface Team {
  id: number;
  event_id: number;
  name: string;
  color: string | null;
  active: boolean;
  players: TeamPlayer[];
  total_skill: number;
  avg_skill: number;
  stats: TeamStats;
}

export type Side = "a" | "b";
export type Staying = "a" | "b" | "none" | "both";

export interface MatchTeam {
  id: number;
  name: string;
  color: string | null;
  active: boolean;
}

export interface Match {
  id: number;
  event_id: number;
  sequence: number;
  status: "in_progress" | "finished";
  team_a: MatchTeam;
  team_b: MatchTeam;
  score_a: number;
  score_b: number;
  staying: Staying | null;
  created_at: string;
  played_at: string | null;
}

export interface MatchStat {
  player_id: number;
  team_id: number | null;
  goals: number;
  assists: number;
}

export interface MatchDetail extends Match {
  stats: MatchStat[];
}

export interface FinishOptions {
  score_a: number;
  score_b: number;
  winner: Side | null;
  active_teams: number;
  wins_to_leave: number;
  streak_after: number;
  options: Staying[];
  default: Staying | null;
  reason: string;
}

export interface NextMatchSuggestion {
  team_a_id: number;
  team_b_id: number;
  reason: string;
}

export interface FinishResult {
  match: Match;
  suggestion: NextMatchSuggestion | null;
}

export interface RankingRow {
  rank: number;
  player_id: number;
  name: string;
  position: string | null;
  photo_url: string | null;
  card_template?: string | null;
  team_id: number | null;
  team_name: string | null;
  team_color: string | null;
  goals: number;
  assists: number;
  points: number;
  score: number;
}
