// カテゴリ定義。並び順はグラフの色（カテゴリカルパレットの固定順）と積み上げ順を兼ねる。
// 色はカテゴリに固定で紐づき、表示件数やランキングで塗り替えない。
export const CATEGORIES = [
  { id: "dev", label: "開発" },
  { id: "work", label: "仕事・生産性" },
  { id: "communication", label: "コミュニケーション" },
  { id: "learning", label: "学習・調べもの" },
  { id: "sns", label: "SNS" },
  { id: "entertainment", label: "エンタメ" },
  { id: "utility", label: "ユーティリティ" },
  { id: "other", label: "その他" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const CATEGORY_IDS: CategoryId[] = CATEGORIES.map((c) => c.id);

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === "string" && (CATEGORY_IDS as string[]).includes(value);
}

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "未分類";
}

// ブラウザのアプリ時間は、Web閲覧履歴（ドメイン別）で内訳に置き換えて集計する。
export const BROWSER_BUNDLE_IDS = new Set([
  "com.google.Chrome",
  "com.google.Chrome.beta",
  "com.google.Chrome.canary",
  "com.apple.Safari",
  "com.apple.mobilesafari",
  "company.thebrowser.Browser",
  "com.microsoft.edgemac",
  "com.brave.Browser",
  "org.mozilla.firefox",
]);
