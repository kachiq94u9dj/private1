-- 端末（Mac / iPhone など）
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 1時間ごとのアプリ / Webドメイン別使用時間（date, hour は Mac のローカル時刻）
CREATE TABLE usage_hourly (
  device_id TEXT NOT NULL,
  date TEXT NOT NULL,
  hour INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('app', 'web')),
  item_key TEXT NOT NULL,
  source TEXT NOT NULL,
  seconds INTEGER NOT NULL,
  PRIMARY KEY (device_id, date, hour, item_type, item_key, source)
);
CREATE INDEX idx_usage_hourly_date ON usage_hourly (date);

-- 1日ごとの持ち上げ回数・通知数（iPhone のみ取れることが多い）
CREATE TABLE device_daily (
  device_id TEXT NOT NULL,
  date TEXT NOT NULL,
  pickups INTEGER NOT NULL DEFAULT 0,
  notifications INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, date)
);

-- アプリ / ドメインの表示名とカテゴリ（AI 自動分類 or 手動）
CREATE TABLE items (
  item_type TEXT NOT NULL,
  item_key TEXT NOT NULL,
  name TEXT,
  category TEXT,
  category_source TEXT,
  categorize_attempts INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (item_type, item_key)
);
CREATE INDEX idx_items_uncategorized ON items (category) WHERE category IS NULL;

-- 目標（例: SNS は 1日30分まで）
CREATE TABLE goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('total', 'category')),
  target_category TEXT,
  comparator TEXT NOT NULL CHECK (comparator IN ('max', 'min')),
  minutes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AI 振り返り（1日1件）
CREATE TABLE reports (
  date TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  content TEXT,
  error TEXT,
  model TEXT,
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 収集スクリプトからの送信履歴（local_date は Mac 側のローカル日付）
CREATE TABLE ingest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload_date TEXT NOT NULL,
  local_date TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
