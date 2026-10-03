#!/usr/bin/env bash
# Установка кабинета на чистый сервер Ubuntu 24.04.
# Запуск:  bash /opt/ege/vps/install.sh 'ПАРОЛЬ_УЧИТЕЛЯ' [свой-домен.ru]
set -euo pipefail
PIN="${1:-}"
if [ ${#PIN} -lt 8 ]; then echo "Укажите пароль учителя не короче 8 символов: bash install.sh 'ВашПароль2027'"; exit 1; fi
APP=/opt/ege
IP=$(hostname -I | awk '{print $1}')
DOMAIN="${2:-${IP//./-}.sslip.io}"

echo "== Ставлю программы (Node.js и Caddy)…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nodejs caddy git

echo "== Настраиваю кабинет…"
id ege >/dev/null 2>&1 || useradd --system --home /var/lib/ege --shell /usr/sbin/nologin ege
mkdir -p /var/lib/ege/data && chown -R ege:ege /var/lib/ege
umask 077
printf 'TEACHER_PIN=%s\nDATA_DIR=/var/lib/ege/data\nPORT=8080\n' "$PIN" > /etc/ege.env
umask 022

cat > /etc/systemd/system/ege.service <<UNIT
[Unit]
Description=Кабинет по русскому языку
After=network.target

[Service]
User=ege
EnvironmentFile=/etc/ege.env
WorkingDirectory=$APP
ExecStart=/usr/bin/node --import $APP/vps/register.mjs $APP/vps/server.mjs
Restart=always

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  request_body {
    max_size 6MB
  }
  reverse_proxy 127.0.0.1:8080
}
CADDY

systemctl daemon-reload
systemctl enable --now ege
systemctl restart caddy

echo "== Ежедневная копия данных в /var/lib/ege/backups (хранится 30 дней)…"
cat > /etc/cron.daily/ege-backup <<'CRON'
#!/bin/sh
mkdir -p /var/lib/ege/backups
tar -czf /var/lib/ege/backups/data-$(date +%F).tar.gz -C /var/lib/ege data
find /var/lib/ege/backups -name 'data-*.tar.gz' -mtime +30 -delete
CRON
chmod +x /etc/cron.daily/ege-backup

sleep 3
echo
echo "=============================================="
echo " Готово! Кабинет: https://$DOMAIN"
echo " Учитель:         https://$DOMAIN/teacher.html"
echo "=============================================="
echo "Если страница не открылась сразу — подождите минуту: сервер получает сертификат."
