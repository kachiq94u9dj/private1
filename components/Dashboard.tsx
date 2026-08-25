"use client";

import { useMemo, useState } from "react";
import type { DailyUsageRow } from "@/lib/supabase";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

interface DayTotal {
  date: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  total: number;
  cost: number;
}

interface EntityTotal {
  name: string;
  tokens: number;
  cost: number;
  sessions: number;
}

function groupByDay(rows: DailyUsageRow[]): DayTotal[] {
  const map = new Map<string, DayTotal>();
  for (const r of rows) {
    const existing = map.get(r.usage_date);
    const input = r.input_tokens;
    const output = r.output_tokens;
    const cacheWrite = r.cache_creation_tokens;
    const cacheRead = r.cache_read_tokens;
    const cost = r.estimated_cost_usd;
    if (existing) {
      existing.input += input;
      existing.output += output;
      existing.cacheWrite += cacheWrite;
      existing.cacheRead += cacheRead;
      existing.total += input + output + cacheWrite + cacheRead;
      existing.cost += cost;
    } else {
      map.set(r.usage_date, {
        date: r.usage_date,
        input,
        output,
        cacheWrite,
        cacheRead,
        total: input + output + cacheWrite + cacheRead,
        cost,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function groupBy(rows: DailyUsageRow[], key: "project" | "model"): EntityTotal[] {
  const map = new Map<string, EntityTotal>();
  for (const r of rows) {
    const name = r[key];
    const tokens = r.input_tokens + r.output_tokens + r.cache_creation_tokens + r.cache_read_tokens;
    const existing = map.get(name);
    if (existing) {
      existing.tokens += tokens;
      existing.cost += r.estimated_cost_usd;
      existing.sessions += r.session_count;
    } else {
      map.set(name, { name, tokens, cost: r.estimated_cost_usd, sessions: r.session_count });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.tokens - a.tokens);
}

const SEGMENTS: { key: keyof Pick<DayTotal, "input" | "output" | "cacheWrite" | "cacheRead">; label: string; color: string }[] = [
  { key: "input", label: "入力", color: "var(--series-1)" },
  { key: "output", label: "出力", color: "var(--series-2)" },
  { key: "cacheWrite", label: "キャッシュ書込", color: "var(--series-3)" },
  { key: "cacheRead", label: "キャッシュ読込", color: "var(--series-4)" },
];

function TrendChart({ days }: { days: DayTotal[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const width = 900;
  const height = 260;
  const padding = { top: 12, right: 12, bottom: 28, left: 48 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const max = Math.max(1, ...days.map((d) => d.total));
  const barGap = 4;
  const barW = days.length > 0 ? chartW / days.length - barGap : 0;

  const yTicks = [0, max / 2, max];

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="日別トークン消費推移"
        onMouseLeave={() => setHover(null)}
      >
        {yTicks.map((t, i) => {
          const y = padding.top + chartH - (t / max) * chartH;
          return (
            <g key={i}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--gridline)" strokeWidth={1} />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
                {formatTokens(t)}
              </text>
            </g>
          );
        })}
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + chartH}
          y2={padding.top + chartH}
          stroke="var(--baseline)"
          strokeWidth={1}
        />

        {days.map((d, i) => {
          const x = padding.left + i * (barW + barGap);
          let yCursor = padding.top + chartH;
          const bars = SEGMENTS.map((seg) => {
            const value = d[seg.key];
            const h = max > 0 ? (value / max) * chartH : 0;
            yCursor -= h;
            return { seg, y: yCursor, h, value };
          });
          const showLabel = days.length <= 15 || i % Math.ceil(days.length / 10) === 0;

          return (
            <g key={d.date}>
              <rect
                x={x}
                y={padding.top}
                width={Math.max(barW, 1)}
                height={chartH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
              {bars.map(({ seg, y, h }, si) =>
                h > 0 ? (
                  <rect
                    key={seg.key}
                    x={x}
                    y={y}
                    width={Math.max(barW, 1)}
                    height={Math.max(h - 2, 0)}
                    fill={seg.color}
                    rx={si === bars.length - 1 || bars.slice(si + 1).every((b) => b.h === 0) ? 3 : 0}
                    opacity={hover === null || hover === i ? 1 : 0.35}
                  />
                ) : null,
              )}
              {showLabel && (
                <text
                  x={x + barW / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--text-muted)"
                >
                  {d.date.slice(5)}
                </text>
              )}
              {hover === i && (
                <line
                  x1={x + barW / 2}
                  x2={x + barW / 2}
                  y1={padding.top}
                  y2={padding.top + chartH}
                  stroke="var(--baseline)"
                  strokeWidth={1}
                  strokeDasharray="2,2"
                />
              )}
            </g>
          );
        })}
      </svg>

      {hover !== null && days[hover] && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12,
            color: "var(--text-primary)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            minWidth: 160,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{days[hover].date}</div>
          {SEGMENTS.map((seg) => (
            <div key={seg.key} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: seg.color,
                    marginRight: 6,
                  }}
                />
                {seg.label}
              </span>
              <span>{formatTokens(days[hover][seg.key])}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontWeight: 600 }}>
            <span>概算コスト</span>
            <span>{formatUsd(days[hover].cost)}</span>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
        {SEGMENTS.map((seg) => (
          <div key={seg.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, display: "inline-block" }} />
            {seg.label}
          </div>
        ))}
        <button
          onClick={() => setShowTable((v) => !v)}
          style={{
            marginLeft: "auto",
            fontSize: 12,
            color: "var(--text-secondary)",
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          {showTable ? "表を隠す" : "表で見る"}
        </button>
      </div>

      {showTable && (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--gridline)", textAlign: "right" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>日付</th>
                <th style={{ padding: "6px 8px", color: "var(--text-secondary)" }}>入力</th>
                <th style={{ padding: "6px 8px", color: "var(--text-secondary)" }}>出力</th>
                <th style={{ padding: "6px 8px", color: "var(--text-secondary)" }}>キャッシュ書込</th>
                <th style={{ padding: "6px 8px", color: "var(--text-secondary)" }}>キャッシュ読込</th>
                <th style={{ padding: "6px 8px", color: "var(--text-secondary)" }}>コスト</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} style={{ borderBottom: "1px solid var(--gridline)", textAlign: "right" }}>
                  <td style={{ textAlign: "left", padding: "6px 8px" }}>{d.date}</td>
                  <td style={{ padding: "6px 8px" }}>{d.input.toLocaleString()}</td>
                  <td style={{ padding: "6px 8px" }}>{d.output.toLocaleString()}</td>
                  <td style={{ padding: "6px 8px" }}>{d.cacheWrite.toLocaleString()}</td>
                  <td style={{ padding: "6px 8px" }}>{d.cacheRead.toLocaleString()}</td>
                  <td style={{ padding: "6px 8px" }}>{formatUsd(d.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RankedBarChart({ items, label }: { items: EntityTotal[]; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.tokens));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.slice(0, 8).map((item) => (
        <div key={item.name}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{item.name}</span>
            <span style={{ color: "var(--text-secondary)" }}>
              {formatTokens(item.tokens)} tok / {formatUsd(item.cost)}
            </span>
          </div>
          <div style={{ background: "var(--gridline)", borderRadius: 4, height: 10 }}>
            <div
              style={{
                width: `${(item.tokens / max) * 100}%`,
                background: "var(--series-1)",
                height: "100%",
                borderRadius: 4,
                minWidth: 2,
              }}
              title={`${label}: ${item.name} — ${item.tokens.toLocaleString()} tokens`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "16px 18px",
        flex: "1 1 160px",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function buildTips(days: DayTotal[], models: EntityTotal[]): string[] {
  const tips: string[] = [];

  const totals = days.reduce(
    (acc, d) => {
      acc.input += d.input;
      acc.output += d.output;
      acc.cacheWrite += d.cacheWrite;
      acc.cacheRead += d.cacheRead;
      return acc;
    },
    { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
  );
  const totalInputSide = totals.input + totals.cacheWrite + totals.cacheRead;
  const cacheReadRatio = totalInputSide > 0 ? totals.cacheRead / totalInputSide : 0;

  if (totalInputSide > 0 && cacheReadRatio < 0.3) {
    tips.push(
      `プロンプトキャッシュの読込比率が${(cacheReadRatio * 100).toFixed(0)}%と低めです。セッションをこまめに終了/再開せず、同じコンテキストを使い回すとキャッシュが効きやすくなりコストが下がります。`,
    );
  }
  if (totals.cacheWrite > totals.cacheRead * 1.5 && totals.cacheWrite > 0) {
    tips.push(
      "キャッシュ書込がキャッシュ読込より大幅に多い状態です。新規セッションを頻繁に開始している可能性があります。関連する作業は同じセッション内で続けるとキャッシュ書込コスト（入力単価の約1.25倍）を節約できます。",
    );
  }

  const opusLike = models.filter((m) => /opus|fable|mythos/i.test(m.name));
  const opusCost = opusLike.reduce((s, m) => s + m.cost, 0);
  const totalCost = models.reduce((s, m) => s + m.cost, 0);
  if (totalCost > 0 && opusCost / totalCost > 0.5) {
    tips.push(
      `コストの${((opusCost / totalCost) * 100).toFixed(0)}%が高性能モデル（Opus/Fable系）です。定型的な作業やサブタスクはSonnet/Haikuに任せ、複雑な設計判断のみOpus/Fableを使うと総コストを抑えられます。`,
    );
  }

  tips.push("長い会話が続いたら `/compact` でコンテキストを圧縮するか、不要なら `/clear` で新規セッションを開始し、無駄な再読み込みを減らしましょう。");
  tips.push("大きなファイル全体を読ませず、Grep/Globで対象を絞ってからRead range指定で読むとトークン消費を抑えられます。");
  tips.push("サブタスクや調査はサブエージェントに任せ、メインの会話コンテキストを肥大化させないようにしましょう。");

  return tips;
}

export default function Dashboard({ rows }: { rows: DailyUsageRow[] }) {
  const days = useMemo(() => groupByDay(rows), [rows]);
  const projects = useMemo(() => groupBy(rows, "project"), [rows]);
  const models = useMemo(() => groupBy(rows, "model"), [rows]);
  const tips = useMemo(() => buildTips(days, models), [days, models]);

  const totalTokens = days.reduce((s, d) => s + d.total, 0);
  const totalCost = days.reduce((s, d) => s + d.cost, 0);
  const totalSessions = projects.reduce((s, p) => s + p.sessions, 0);
  const avgPerDay = days.length > 0 ? totalTokens / days.length : 0;

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 20px 80px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Claude Usage Tracker</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>
          直近30日間の Claude Code トークン消費量
        </p>
      </header>

      {rows.length === 0 ? (
        <div
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 24,
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          <p>まだデータがありません。ローカルでログ収集スクリプトを実行してください。</p>
          <pre
            style={{
              background: "var(--page-plane)",
              padding: 12,
              borderRadius: 8,
              overflowX: "auto",
              fontSize: 13,
            }}
          >
            npm install{"\n"}npm run collect
          </pre>
          <p>実行後、このページを再読み込みするとデータが表示されます。詳細は README.md を参照してください。</p>
        </div>
      ) : (
        <>
          <section style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
            <StatTile label="合計トークン (30日)" value={formatTokens(totalTokens)} />
            <StatTile label="概算コスト (30日)" value={formatUsd(totalCost)} sub="価格表は lib/pricing.ts で調整可能" />
            <StatTile label="セッション数" value={`${totalSessions}`} />
            <StatTile label="1日あたり平均" value={formatTokens(avgPerDay)} />
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>日別トークン消費推移</h2>
            <div
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <TrendChart days={days} />
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>
            <div
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>プロジェクト別内訳</h2>
              <RankedBarChart items={projects} label="プロジェクト" />
            </div>
            <div
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>モデル別内訳</h2>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--gridline)" }}>
                    <th style={{ textAlign: "left", padding: "6px 4px", color: "var(--text-secondary)" }}>モデル</th>
                    <th style={{ textAlign: "right", padding: "6px 4px", color: "var(--text-secondary)" }}>トークン</th>
                    <th style={{ textAlign: "right", padding: "6px 4px", color: "var(--text-secondary)" }}>コスト</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m.name} style={{ borderBottom: "1px solid var(--gridline)" }}>
                      <td style={{ padding: "6px 4px" }}>{m.name}</td>
                      <td style={{ padding: "6px 4px", textAlign: "right" }}>{formatTokens(m.tokens)}</td>
                      <td style={{ padding: "6px 4px", textAlign: "right" }}>{formatUsd(m.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>節約のための提案</h2>
            <ul style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
              {tips.map((tip, i) => (
                <li key={i} style={{ color: "var(--text-primary)" }}>
                  {tip}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
