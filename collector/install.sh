#!/bin/bash
# 収集スクリプトを launchd に登録する（Mac 上で実行）。
#   ./collector/install.sh            … 登録
#   ./collector/install.sh uninstall  … 解除
set -euo pipefail

LABEL="com.screen-time-insights.collector"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="$HOME/.screen-time-insights"

if [[ "${1:-}" == "uninstall" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "解除しました"
  exit 0
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "node が見つかりません。Node.js 22.18 以上をインストールしてください" >&2
  exit 1
fi
NODE_BIN="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$NODE_BIN" 2>/dev/null || echo "$NODE_BIN")"

mkdir -p "$CONFIG_DIR" "$HOME/Library/LaunchAgents"
if [[ ! -f "$CONFIG_DIR/config.env" ]]; then
  cat > "$CONFIG_DIR/config.env" <<CONF
# ダッシュボードの URL（例: https://screen-time-insights.example.workers.dev）
STI_URL=
# Worker の INGEST_TOKEN と同じ値
STI_INGEST_TOKEN=
# Cloudflare Access のサービストークン（README 参照）
CF_ACCESS_CLIENT_ID=
CF_ACCESS_CLIENT_SECRET=
# 除外したい端末名（カンマ区切り。家族の端末など）
STI_EXCLUDE_DEVICES=
CONF
  chmod 600 "$CONFIG_DIR/config.env"
  echo "設定ファイルを作成しました: $CONFIG_DIR/config.env （STI_URL などを記入してください）"
fi

# 30分ごとに起動し、スクリプト側で「1日1回・朝4時以降」に絞る。
# スリープ中に過ぎた分は復帰時に実行されるため、朝 Mac を開いたときに前日分が送られる。
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$REPO_DIR/collector/collect.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>1800</integer>
  <key>StandardOutPath</key><string>$CONFIG_DIR/collector.log</string>
  <key>StandardErrorPath</key><string>$CONFIG_DIR/collector.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "登録しました: $PLIST"
echo "フルディスクアクセスに次のファイルを追加してください: $NODE_BIN"
echo "ログ: $CONFIG_DIR/collector.log"
