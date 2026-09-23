import type { OverviewResponse } from "../shared/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

export interface ItemRow {
  type: "app" | "web";
  key: string;
  name: string | null;
  category: string | null;
  categorySource: "ai" | "manual" | null;
  seconds: number;
}

export interface GoalRow {
  id: number;
  target_kind: "total" | "category";
  target_category: string | null;
  comparator: "max" | "min";
  minutes: number;
}

export const api = {
  overview: (date: string | null, device: string) =>
    request<OverviewResponse>(`/api/overview?device=${encodeURIComponent(device)}${date ? `&date=${date}` : ""}`),
  items: () => request<{ items: ItemRow[] }>("/api/items"),
  setCategory: (type: string, key: string, category: string | null) =>
    request(`/api/items/${type}/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ category }) }),
  categorize: () => request<{ categorized: number }>("/api/items/categorize", { method: "POST" }),
  goals: () => request<{ goals: GoalRow[] }>("/api/goals"),
  addGoal: (category: string, comparator: "max" | "min", minutes: number) =>
    request("/api/goals", { method: "POST", body: JSON.stringify({ category, comparator, minutes }) }),
  deleteGoal: (id: number) => request(`/api/goals/${id}`, { method: "DELETE" }),
  regenerate: (date: string, notify: boolean) =>
    request(`/api/reports/${date}/regenerate${notify ? "?notify=1" : ""}`, { method: "POST" }),
};
