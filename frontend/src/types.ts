export type Role = "admin" | "member";

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
}

export interface Member {
  user_id: number;
  name: string;
  email: string;
  role: Role;
  joined_at: string;
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
}

export interface ParsedPlayerRow {
  name: string;
  skill: number;
  position: string | null;
  error: string | null;
  note: string | null;
}

export interface ImportPreview {
  rows: ParsedPlayerRow[];
  total: number;
  valid: number;
  invalid: number;
}

export interface EventItem {
  id: number;
  group_id: number;
  title: string;
  date: string;
  created_at: string;
}

export interface TeamPlayer {
  id: number;
  name: string;
  position: string | null;
  skill: number;
}

export interface Team {
  id: number;
  event_id: number;
  name: string;
  color: string | null;
  players: TeamPlayer[];
  total_skill: number;
  avg_skill: number;
}
