import type { Env, Member } from "../types";
import { readTable } from "./sheets";

function toMember(record: Record<string, string>): Member {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    role: (record.role as Member["role"]) || "other",
    status: (record.status as Member["status"]) || "active",
    isAdmin: record.is_admin === "TRUE" || record.is_admin === "true",
  };
}

export async function getMembers(env: Env): Promise<Member[]> {
  const rows = await readTable(env, "Members");
  return rows.map((r) => toMember(r.record));
}

export async function findMemberByEmail(env: Env, email: string): Promise<Member | null> {
  const members = await getMembers(env);
  return members.find((m) => m.email.toLowerCase() === email.toLowerCase()) ?? null;
}
