# دسترسی امن از بیرون شرکت / Secure Remote Access

## فارسی

روش پیشنهادی Drop استفاده از **Tailscale** است. در این روش پورت مودم باز نمی‌شود و برنامه روی اینترنت عمومی قرار نمی‌گیرد. فقط دستگاه‌هایی که عضو شبکهٔ خصوصی Tailscale شما هستند می‌توانند Drop را باز کنند.

### راه‌اندازی میزبان ویندوز

1. روی `setup-remote-access-windows.cmd` راست‌کلیک و **Run as administrator** را انتخاب کنید.
2. اگر Tailscale نصب نباشد، اسکریپت آن را با Winget نصب می‌کند.
3. صفحهٔ ورود Tailscale باز می‌شود؛ با حساب خود وارد شوید.
4. نام میزبان روی `drop-office` تنظیم می‌شود و فایروال فقط برای شبکهٔ خصوصی Tailscale و پورت Drop باز خواهد شد.
5. برای مشاهده آدرس‌ها، `remote-access-status.cmd` را اجرا کنید.

روی آیفون یا لپ‌تاپ خارج شرکت، Tailscale را نصب کنید و با همان حساب یا حساب دعوت‌شده وارد شوید. سپس باز کنید:

```text
http://drop-office:8088
```

اگر پورت را در `config.json` تغییر داده‌اید، همان پورت را جایگزین `8088` کنید. اگر نام کوتاه کار نکرد، آدرس کامل MagicDNS یا IP با پیشوند `100.` را از `remote-access-status.cmd` بردارید.

### افزودن همکاران

همکار را از بخش Users پنل مدیریتی Tailscale دعوت کنید، یا دستگاه میزبان را با حساب او Share کنید. حذف کاربر یا دستگاه از Tailscale دسترسی بیرون شرکت او را قطع می‌کند، بدون اینکه حساب Drop او حذف شود.

## English

Drop recommends **Tailscale** for remote access. It does not open a router port or expose Drop to the public internet. Only approved devices on your private Tailscale network can connect.

### Windows host setup

1. Right-click `setup-remote-access-windows.cmd` and select **Run as administrator**.
2. The script installs Tailscale with Winget if necessary.
3. Complete the Tailscale sign-in in your browser.
4. The host is named `drop-office`, and Windows Firewall is opened only for the Tailscale address range and Drop's configured port.
5. Run `remote-access-status.cmd` to display the available addresses.

Install Tailscale on an outside iPhone or laptop and sign in to the same tailnet (or an invited account), then open:

```text
http://drop-office:8088
```

Use the port from `config.json` if it differs. If the short MagicDNS name is unavailable, use the full MagicDNS name or the `100.x.y.z` address printed by the status script.

Never enable router port forwarding for Drop. The application is designed to remain private behind the local network or Tailscale.
