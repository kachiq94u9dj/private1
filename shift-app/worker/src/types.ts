export interface Env {
  SESSIONS: KVNamespace;

  ALLOWED_EMAIL_DOMAIN: string;
  SPREADSHEET_ID: string;
  FRONTEND_URL: string;
  GOOGLE_OAUTH_REDIRECT_URI: string;

  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  SLACK_WEBHOOK_URL: string;
}

export type MemberRole = "counselor" | "supporter" | "manager" | "sales" | "other";
export type MemberStatus = "active" | "inactive";

export interface Member {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  isAdmin: boolean;
}

export type AvailabilitySymbol = "batsu" | "sankaku" | "maru"; // ✕ / △ / ●

export interface Availability {
  id: string;
  memberId: string;
  date: string; // YYYY-MM-DD
  symbol: AvailabilitySymbol;
  note: string;
  updatedAt: string;
}

export type ShiftType = "work" | "daikyu";
export type ShiftStatus = "draft" | "confirmed";

export interface Shift {
  id: string;
  date: string;
  memberId: string;
  type: ShiftType;
  status: ShiftStatus;
  updatedBy: string;
  updatedAt: string;
}

export type RequestType = "change" | "swap";
export type RequestStatus = "pending" | "approved" | "rejected";

export interface ShiftChangeRequest {
  id: string;
  type: RequestType;
  requesterId: string;
  targetShiftId: string;
  proposedDate: string;
  reason: string;
  status: RequestStatus;
  approverId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Holiday {
  date: string;
  name: string;
}

export interface SessionData {
  memberId: string;
  email: string;
  name: string;
  isAdmin: boolean;
}
