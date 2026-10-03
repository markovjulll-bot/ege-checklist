#!/usr/bin/env bash
# Обновление кабинета после изменений на GitHub:  bash /opt/ege/vps/update.sh
set -euo pipefail
cd /opt/ege
git pull --ff-only
systemctl restart ege
echo "Готово: кабинет обновлён."
