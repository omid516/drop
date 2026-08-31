import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getLanAddresses } from './local-name.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('Node.js 22 or newer is required.');
  process.exit(1);
}

const configPath = path.join(root, 'config.json');
if (!fs.existsSync(configPath)) fs.copyFileSync(path.join(root, 'config.example.json'), configPath);

let config;
try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); }
catch { console.error('config.json is not valid JSON.'); process.exit(1); }
const port = Number(config.port || 8088);
const localUrl = `http://localhost:${port}`;
const localName = String(config.localName || 'drop').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'drop';
const friendlyUrl = `http://${localName}.local:${port}`;

function openBrowser(url) {
  try {
    if (process.platform === 'win32') spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* The printed URL remains available. */ }
}

function portIsOpen() {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const done = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(350);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

console.log('');
console.log('DROP');
console.log('Local file sharing server');
console.log('');

if (await portIsOpen()) {
  console.log(`Port ${port} is already in use.`);
  console.log(`Opening ${localUrl}`);
  console.log('If this is not Drop, change the port in config.json.');
  openBrowser(localUrl);
  process.exit(0);
}

console.log(`This computer: ${localUrl}`);
console.log(`Easy address: ${friendlyUrl}`);
for (const address of getLanAddresses()) console.log(`Backup address: http://${address}:${port}`);
console.log('');
console.log('Keep this window open. Press Ctrl+C to stop the server.');
console.log('Allow access only for Private networks if Windows Firewall asks.');
setTimeout(() => openBrowser(localUrl), 800);

await import('./server.mjs');
