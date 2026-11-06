#!/usr/bin/env sh
cd "$(dirname "$0")"
echo "Сайт: http://localhost:8000  (остановить: Ctrl+C)"
python3 -m http.server 8000
