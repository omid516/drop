# Drop

[مستندات فارسی](README.md)

Drop is a local-first file and message sharing application for small teams. It runs on Windows, macOS, or Linux, while colleagues connect from any modern browser on the same network—without installing a client application.

> Version `0.9.0` is ready for private local networks and includes complete Persian and English interfaces. Direct public internet exposure is not recommended.

## Features

- Persian and English UI with saved language preference and automatic RTL/LTR layout
- Name and 6–12 digit PIN authentication
- The first registered account becomes an administrator
- File-only, message-only, and combined message/file transfers
- Multiple recipients and online presence
- Folder uploads with paths preserved
- Chunked uploads with resume support
- Up to 2 GB per file and a configurable 15 GB default storage limit
- Inbox search and filters for messages, files, and unread items
- Replies, reply notifications, and unread counters
- Per-recipient delivery, view, and download status
- Sender/admin deletion and complete administrator access
- Streaming ZIP downloads without temporary archive files
- `drop.local` discovery on supported networks, with the LAN IP as fallback
- Optional hidden automatic startup after Windows sign-in

## Requirements

- Node.js 22.5 or newer
- All users connected to the same private network
- The host computer must remain powered on while Drop is in use

No `npm install` step is required. Drop uses Node.js built-in modules, including `node:sqlite`.

## Quick start on Windows

1. Extract the release archive to a permanent folder.
2. Double-click `start-windows.cmd`.
3. Allow Node.js on **Private networks** if Windows Firewall prompts you.
4. Open the address printed by the launcher, normally `http://drop.local:8088` or the displayed LAN IP.
5. Register the first account; it automatically becomes the administrator.

To start Drop silently whenever you sign in to Windows, run `install-windows-autostart.cmd` once. Use `uninstall-windows-autostart.cmd` to remove automatic startup.

## macOS and Linux

On macOS, run `start-mac.command`. On Linux, run:

```bash
node server.mjs
```

## Configuration

On first launch, `config.example.json` is copied to `config.json`. Important options include:

- `port`: HTTP port, default `8088`
- `host`: listening address, default `0.0.0.0`
- `localName`: local hostname, default `drop`
- `dataDirectory`: database and uploaded-file directory
- `storageLimitBytes`: total storage limit
- `reserveBytes`: reserved host disk space
- `maxFileBytes`: maximum size per file
- `registrationCode`: optional code required during registration

Restart the server after changing the configuration.

## Data and backup

All persistent data is stored under `data/` by default:

- `app.db`: users, sessions, transfers, replies, and status records
- `files/`: completed uploads
- `temporary/`: incomplete uploads

For a backup, stop the server and copy both the `data` directory and `config.json`. Restore those items into the same application folder before starting Drop.

## Testing

```bash
node --test
```

## Security notes

PINs are stored using `scrypt` with random salts. Sessions use HttpOnly and SameSite cookies, registration is limited to private IP addresses, and stored filenames are randomized.

Before exposing Drop outside the private network, add HTTPS, stronger authentication, rate limiting, CSRF protection, malware scanning, and a reverse proxy or VPN. See [SECURITY.md](SECURITY.md).

## Limitations

- `.local` discovery depends on multicast support; use the LAN IP when unavailable.
- Resuming an upload requires selecting the same files or folder again.
- ZIP archives are streamed without compression to avoid additional RAM and temporary disk usage.
- The current release is not hardened for direct public internet hosting.

## License

No public software license has been assigned yet. Vazirmatn is distributed under the SIL Open Font License 1.1.
