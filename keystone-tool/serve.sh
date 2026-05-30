#!/usr/bin/env bash
# 一键本地预览：在浏览器打开 http://localhost:<端口>
# 用法: ./serve.sh [端口]   (默认 8000)
set -e
cd "$(dirname "$0")"
PORT="${1:-8000}"
URL="http://localhost:${PORT}/index.html"
echo "投影梯形预矫正工具 → ${URL}"
echo "按 Ctrl+C 停止。"

# 尝试自动打开浏览器
( sleep 1
  if command -v open >/dev/null 2>&1; then open "$URL"          # macOS
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" # Linux
  elif command -v start >/dev/null 2>&1; then start "$URL"       # Git Bash / Windows
  fi ) >/dev/null 2>&1 &

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT"
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes serve -l "$PORT" .
else
  echo "未找到 python3 或 npx，请手动用浏览器打开 index.html"
  exit 1
fi
