import { useEffect, useState } from "react";
import {
  approveRequest,
  createRequest,
  fetchMembers,
  fetchRequests,
  rejectRequest,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Member, RequestType, ShiftChangeRequest } from "../types";

export function RequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ShiftChangeRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState({
    type: "change" as RequestType,
    targetShiftId: "",
    proposedDate: "",
    reason: "",
  });

  const load = async () => {
    const [r, m] = await Promise.all([fetchRequests(), fetchMembers()]);
    setRequests(r.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setMembers(m);
  };

  useEffect(() => {
    load();
  }, []);

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? id;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.targetShiftId || !form.proposedDate) return;
    await createRequest(form);
    setForm({ type: "change", targetShiftId: "", proposedDate: "", reason: "" });
    await load();
  };

  const onApprove = async (id: string) => {
    await approveRequest(id);
    await load();
  };

  const onReject = async (id: string) => {
    await rejectRequest(id);
    await load();
  };

  const statusLabel: Record<string, string> = {
    pending: "承認待ち",
    approved: "承認済み",
    rejected: "却下",
  };

  return (
    <div>
      <h2>シフト変更・交換の申請</h2>

      <form onSubmit={onSubmit} className="inline-form">
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as RequestType })}
        >
          <option value="change">変更</option>
          <option value="swap">交換</option>
        </select>
        <input
          placeholder="対象シフトID"
          value={form.targetShiftId}
          onChange={(e) => setForm({ ...form, targetShiftId: e.target.value })}
          required
        />
        <input
          type="date"
          value={form.proposedDate}
          onChange={(e) => setForm({ ...form, proposedDate: e.target.value })}
          required
        />
        <input
          placeholder="理由"
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
        <button type="submit">申請する</button>
      </form>
      <p className="hint">
        対象シフトIDは「シフト確定カレンダー」のシフト一覧から確認してください(v1では手入力)。
      </p>

      <table className="grid-table">
        <thead>
          <tr>
            <th>申請者</th>
            <th>種別</th>
            <th>希望日</th>
            <th>理由</th>
            <th>状態</th>
            {user?.isAdmin && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>{memberName(r.requesterId)}</td>
              <td>{r.type === "swap" ? "交換" : "変更"}</td>
              <td>{r.proposedDate}</td>
              <td>{r.reason}</td>
              <td>{statusLabel[r.status]}</td>
              {user?.isAdmin && (
                <td>
                  {r.status === "pending" && (
                    <>
                      <button onClick={() => onApprove(r.id)}>承認</button>
                      <button onClick={() => onReject(r.id)}>却下</button>
                    </>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
