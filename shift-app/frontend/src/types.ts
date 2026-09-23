export type MemberRole = "counselor" | "supporter" | "manager" | "sales" | "other";

export interface Member {
  id: string;
  name: string;
  role: MemberRole;
  status: "active" | "inactive";
  isAdmin: boolean;
}

export type AvailabilitySymbol = "batsu" | "sankaku" | "maru"; // ✕ / △ / ●

export interface Availability {
  id: string;
  memberId: string;
  date: string;
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

export interface CurrentUser {
  memberId: string;
  email: string;
  name: string;
  isAdmin: boolean;
}
