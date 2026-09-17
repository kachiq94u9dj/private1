import type {
  Availability,
  AvailabilitySymbol,
  CurrentUser,
  Holiday,
  Member,
  RequestType,
  Shift,
  ShiftChangeRequest,
  ShiftType,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    if (res.status === 401) throw new AuthError();
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export class AuthError extends Error {
  constructor() {
    super("unauthorized");
  }
}

export const loginUrl = `${API_BASE}/api/auth/login`;

export function fetchMe(): Promise<CurrentUser> {
  return request("/api/auth/me");
}

export function logout(): Promise<void> {
  return request("/api/auth/logout", { method: "POST" });
}

export function fetchMembers(): Promise<Member[]> {
  return request("/api/members");
}

export function fetchAvailability(from: string, to: string): Promise<Availability[]> {
  return request(`/api/availability?from=${from}&to=${to}`);
}

export function upsertAvailability(
  date: string,
  symbol: AvailabilitySymbol,
  note?: string
): Promise<{ id: string }> {
  return request("/api/availability", {
    method: "POST",
    body: JSON.stringify({ date, symbol, note }),
  });
}

export function fetchShifts(from: string, to: string): Promise<Shift[]> {
  return request(`/api/shifts?from=${from}&to=${to}`);
}

export function confirmShift(date: string, memberId: string, type: ShiftType): Promise<{ id: string }> {
  return request("/api/shifts/confirm", {
    method: "POST",
    body: JSON.stringify({ date, memberId, type }),
  });
}

export function fetchRequests(status?: string): Promise<ShiftChangeRequest[]> {
  return request(`/api/requests${status ? `?status=${status}` : ""}`);
}

export function createRequest(payload: {
  type: RequestType;
  targetShiftId: string;
  proposedDate: string;
  reason: string;
}): Promise<{ id: string }> {
  return request("/api/requests", { method: "POST", body: JSON.stringify(payload) });
}

export function approveRequest(id: string): Promise<ShiftChangeRequest> {
  return request(`/api/requests/${id}/approve`, { method: "POST" });
}

export function rejectRequest(id: string): Promise<ShiftChangeRequest> {
  return request(`/api/requests/${id}/reject`, { method: "POST" });
}

export function fetchHolidays(): Promise<Holiday[]> {
  return request("/api/holidays");
}

export function addHoliday(date: string, name: string): Promise<void> {
  return request("/api/holidays", { method: "POST", body: JSON.stringify({ date, name }) });
}

export function deleteHoliday(date: string): Promise<void> {
  return request(`/api/holidays/${date}`, { method: "DELETE" });
}
