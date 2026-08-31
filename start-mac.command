#!/bin/sh
cd "$(dirname "$0")" || exit 1
clear
printf '\n  هم‌رسان\n  راه‌اندازی سرور فایل داخلی\n\n'
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js نصب نیست؛ صفحه دانلود رسمی باز می‌شود."
  open "https://nodejs.org/en/download"
  read -r -p "پس از نصب، دوباره اجرا کنید. برای خروج Enter بزنید."
  exit 1
fi
major="$(node -p 'process.versions.node.split(`.`)[0]')"
if [ "$major" -lt 22 ]; then echo "Node.js 22 یا جدیدتر لازم است."; exit 1; fi
[ -f config.json ] || cp config.example.json config.json
exec caffeinate node launcher.mjs
