# دسترسی امن از بیرون شرکت / Secure Remote Access

## فارسی

روش پیشنهادی Drop استفاده از **Tailscale** است. در این روش پورت مودم باز نمی‌شود و برنامه روی اینترنت عمومی قرار نمی‌گیرد. فقط دستگاه‌هایی که عضو شبکهٔ خصوصی Tailscale شما هستند می‌توانند Drop را باز کنند.

### چه کسانی باید Tailscale نصب کنند؟

- کاربران داخل شبکهٔ شرکت نیازی به Tailscale ندارند و همچنان از `http://drop.local:8088` استفاده می‌کنند.
- هر گوشی یا لپ‌تاپی که از بیرون شرکت متصل می‌شود باید Tailscale داشته باشد.
- همکاران نباید با حساب مدیر وارد شوند. هر همکار با ایمیل و حساب خودش وارد می‌شود و مدیر او را به Tailnet دعوت می‌کند.
- حساب داخل Drop از حساب Tailscale مستقل است؛ پس از اتصال شبکه، کاربر همچنان با نام و PIN خودش وارد Drop می‌شود.

### راه‌اندازی میزبان ویندوز

1. روی `setup-remote-access-windows.cmd` راست‌کلیک و **Run as administrator** را انتخاب کنید.
2. اگر Tailscale نصب نباشد، اسکریپت آن را با Winget نصب می‌کند.
3. اگر نصب خودکار به‌دلیل محدودیت دانلود انجام نشد، Tailscale را از `https://tailscale.com/download/windows` نصب و وارد حساب مدیر شوید؛ سپس اسکریپت را دوباره اجرا کنید.
4. نام میزبان روی `drop-office` تنظیم می‌شود و فایروال فقط برای شبکهٔ خصوصی Tailscale و پورت Drop باز خواهد شد.
5. برای مشاهده آدرس‌ها، `remote-access-status.cmd` را اجرا کنید.

روی آیفون یا لپ‌تاپ خارج شرکت، Tailscale را نصب کنید و با حساب مستقلِ دعوت‌شده وارد شوید. ابتدا Wi-Fi شرکت را خاموش کنید تا آزمایش واقعاً از اینترنت بیرون انجام شود، سپس یکی از آدرس‌های زیر را باز کنید:

```text
http://drop-office:8088
http://drop-office.<your-tailnet>.ts.net:8088
http://100.x.y.z:8088
```

اگر پورت را در `config.json` تغییر داده‌اید، همان پورت را جایگزین `8088` کنید. اگر نام کوتاه کار نکرد، آدرس کامل MagicDNS یا IP با پیشوند `100.` را از `remote-access-status.cmd` بردارید.

### افزودن همکاران

1. وارد پنل مدیریتی Tailscale شوید.
2. در بخش **Users** گزینهٔ دعوت کاربر را انتخاب کنید و ایمیل خود همکار را وارد کنید؛ یا از صفحهٔ **Machines** فقط دستگاه `drop-office` را با او Share کنید.
3. همکار دعوت را می‌پذیرد، Tailscale را روی دستگاه خودش نصب می‌کند و با حساب خودش وارد می‌شود.
4. حذف کاربر، دستگاه یا Share از Tailscale دسترسی بیرون شرکت او را قطع می‌کند، بدون اینکه حساب Drop او حذف شود.

### رفع اشکال

- کامپیوتر میزبان، Drop و Tailscale باید روشن باشند.
- در اجرای `remote-access-status.cmd` وضعیت باید Running باشد و یک IP با پیشوند `100.` نمایش داده شود.
- اگر نام `drop-office` باز نشد، ابتدا آدرس کامل `.ts.net` و سپس IP با پیشوند `100.` را امتحان کنید.
- اگر روی خود میزبان آدرس Tailscale پاسخ می‌دهد ولی دستگاه دیگر وصل نمی‌شود، `setup-remote-access-windows.cmd` را حتماً با **Run as administrator** اجرا کنید تا قانون فایروال ساخته شود.
- هیچ Port Forwarding روی مودم ایجاد نکنید.

## English

Drop recommends **Tailscale** for remote access. It does not open a router port or expose Drop to the public internet. Only approved devices on your private Tailscale network can connect.

### Who needs Tailscale?

- Users on the office LAN do not need Tailscale and can continue using `http://drop.local:8088`.
- Every phone or laptop connecting from outside the office needs the Tailscale client.
- Colleagues must use their own Tailscale accounts. Never share the administrator's login.
- Drop accounts remain separate: after the private network connects, each user signs in to Drop with their own name and PIN.

### Windows host setup

1. Right-click `setup-remote-access-windows.cmd` and select **Run as administrator**.
2. The script installs Tailscale with Winget if necessary.
3. If automatic installation is blocked, install from `https://tailscale.com/download/windows`, sign in as the administrator, and run the setup script again.
4. The host is named `drop-office`, and Windows Firewall is opened only for the Tailscale address range and Drop's configured port.
5. Run `remote-access-status.cmd` to display the available addresses.

Install Tailscale on an outside iPhone or laptop, accept the invitation, and sign in with that colleague's own account. Disable the office Wi-Fi for a genuine external test, then open one of:

```text
http://drop-office:8088
http://drop-office.<your-tailnet>.ts.net:8088
http://100.x.y.z:8088
```

Use the port from `config.json` if it differs. If the short MagicDNS name is unavailable, use the full MagicDNS name or the `100.x.y.z` address printed by the status script.

Invite colleagues from the Tailscale admin console's **Users** page, or share only the `drop-office` machine from **Machines**. Removing the user or machine share immediately revokes remote network access without deleting their Drop account.

Never enable router port forwarding for Drop. The application is designed to remain private behind the local network or Tailscale.
