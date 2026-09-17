import type { Env } from "../types";
import { getServiceAccountAccessToken } from "./googleAuth";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

async function sheetsFetch(env: Env, path: string, init?: RequestInit) {
  const token = await getServiceAccountAccessToken(env);
  const res = await fetch(`${SHEETS_API}/${env.SPREADSHEET_ID}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Sheets API error (${path}): ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** A1記法のrangeから値の2次元配列を取得 (例: "Members!A2:F") */
export async function getValues(env: Env, range: string): Promise<string[][]> {
  const data = (await sheetsFetch(
    env,
    `/values/${encodeURIComponent(range)}`
  )) as { values?: string[][] };
  return data.values ?? [];
}

/** 末尾に1行追記 */
export async function appendRow(env: Env, tab: string, row: (string | number | boolean)[]) {
  await sheetsFetch(
    env,
    `/values/${encodeURIComponent(`${tab}!A1`)}:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      body: JSON.stringify({ values: [row] }),
    }
  );
}

/** 1行を上書き (rowNumberはシート上の実際の行番号、ヘッダーは1行目) */
export async function updateRow(
  env: Env,
  tab: string,
  rowNumber: number,
  row: (string | number | boolean)[]
) {
  const range = `${tab}!A${rowNumber}`;
  await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [row] }),
  });
}

/**
 * ヘッダー行 + データ行を持つタブを読み、ヘッダー名をキーにしたオブジェクトへ変換する。
 * rowNumber はシート上の実際の行番号(1始まり、ヘッダーがrow 1)を返し、更新時に使う。
 */
export async function readTable(
  env: Env,
  tab: string
): Promise<{ rowNumber: number; record: Record<string, string> }[]> {
  const all = await getValues(env, `${tab}!A1:Z`);
  if (all.length === 0) return [];
  const [header, ...rows] = all;
  return rows.map((row, i) => {
    const record: Record<string, string> = {};
    header.forEach((key, col) => {
      record[key] = row[col] ?? "";
    });
    return { rowNumber: i + 2, record };
  });
}
