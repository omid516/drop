import crypto from 'node:crypto';

export const randomId = (bytes = 18) => crypto.randomBytes(bytes).toString('base64url');
export const hashPin = (pin, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  return `${salt}:${hash}`;
};
export const verifyPin = (pin, stored) => {
  const [salt, expected] = String(stored).split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(pin), salt, 64);
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
};
export const safeName = (name) => String(name ?? '').normalize('NFKC').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120);
export const safeRelativePath = (value) => {
  const path = String(value ?? '').replaceAll('\\', '/').split('/').filter(Boolean);
  if (!path.length || path.some((part) => part === '.' || part === '..')) throw new Error('مسیر فایل نامعتبر است');
  return path.map(safeName).filter(Boolean).join('/');
};
export const parseCookies = (header = '') => Object.fromEntries(header.split(';').map(v => v.trim()).filter(Boolean).map(v => {
  const i = v.indexOf('='); return [decodeURIComponent(i < 0 ? v : v.slice(0, i)), decodeURIComponent(i < 0 ? '' : v.slice(i + 1))];
}));
export const isPrivateIp = (ip) => {
  ip = String(ip).replace(/^::ffff:/, '');
  if (ip === '::1' || ip.startsWith('127.')) return true;
  const p = ip.split('.').map(Number);
  return p.length === 4 && (p[0] === 10 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31));
};
export const formatBytes = (n) => `${(Number(n) / 1024 / 1024).toFixed(1)} MB`;
