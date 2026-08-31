import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomId, hashPin, verifyPin, safeName, safeRelativePath, parseCookies, isPrivateIp } from './lib.mjs';
import { startLocalName } from './local-name.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const configPath = process.env.OFFICE_SHARE_CONFIG || path.join(root, 'config.json');
const defaults = { port: 8088, host: '0.0.0.0', localName: 'drop', dataDirectory: './data', storageLimitBytes: 15 * 1024 ** 3, reserveBytes: 1024 ** 3, maxFileBytes: 2 * 1024 ** 3, registrationCode: '' };
const config = { ...defaults, ...(fs.existsSync(configPath) ? JSON.parse(await fsp.readFile(configPath, 'utf8')) : {}) };
const dataDir = path.resolve(root, config.dataDirectory);
const filesDir = path.join(dataDir, 'files');
const tempDir = path.join(dataDir, 'temporary');
await Promise.all([fsp.mkdir(filesDir, { recursive: true }), fsp.mkdir(tempDir, { recursive: true })]);
const db = new DatabaseSync(path.join(dataDir, 'app.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,pin_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS transfers(id TEXT PRIMARY KEY,sender_id TEXT NOT NULL,title TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'uploading',created_at INTEGER NOT NULL,total_bytes INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(sender_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS transfer_files(id TEXT PRIMARY KEY,transfer_id TEXT NOT NULL,relative_path TEXT NOT NULL,stored_name TEXT NOT NULL,size INTEGER NOT NULL,uploaded INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(transfer_id) REFERENCES transfers(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS recipients(transfer_id TEXT NOT NULL,user_id TEXT NOT NULL,seen_at INTEGER,download_count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(transfer_id,user_id),FOREIGN KEY(transfer_id) REFERENCES transfers(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT,action TEXT NOT NULL,target_type TEXT,target_id TEXT,details TEXT,ip TEXT,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_recipients_user ON recipients(user_id);`);
try { db.exec('ALTER TABLE users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0'); } catch (e) { if (!String(e).includes('duplicate column')) throw e; }
db.exec('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC); PRAGMA optimize;');

const clients = new Map();
const json = (res, status, body) => { const data = JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data), 'cache-control': 'no-store' }); res.end(data); };
const readJson = async (req, limit = 1024 * 1024) => { const chunks=[]; let size=0; for await (const chunk of req) { size += chunk.length; if(size>limit) throw new Error('درخواست بیش از حد بزرگ است'); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); };
const currentUser = (req) => {
  const sid = parseCookies(req.headers.cookie).session; if (!sid) return null;
  return db.prepare(`SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>? AND u.blocked=0`).get(sid, Date.now()) || null;
};
const requireUser = (req, res) => { const user=currentUser(req); if(!user) json(res,401,{error:'ابتدا وارد شوید'}); return user; };
const broadcast = (event, payload, userIds = null) => { const msg=`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`; for(const [uid,set] of clients){ if(userIds && !userIds.includes(uid)) continue; for(const res of set) res.write(msg); } };
const storageUsed = () => Number(db.prepare(`SELECT COALESCE(SUM(size),0) n FROM transfer_files WHERE uploaded=size`).get().n);
const canAccessTransfer = (user, id) => !!db.prepare(`SELECT 1 FROM transfers t LEFT JOIN recipients r ON r.transfer_id=t.id AND r.user_id=? WHERE t.id=? AND (t.sender_id=? OR r.user_id=? OR ?='admin')`).get(user.id,id,user.id,user.id,user.role);
const audit = (req, actor, action, targetType='', targetId='', details='') => db.prepare('INSERT INTO audit_logs(actor_id,action,target_type,target_id,details,ip,created_at) VALUES(?,?,?,?,?,?,?)').run(actor?.id||null,action,targetType,targetId,details,String(req.socket.remoteAddress||''),Date.now());

const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0});
const crcUpdate=(crc,buf)=>{for(const byte of buf)crc=crcTable[(crc^byte)&255]^(crc>>>8);return crc>>>0};
const dosDateTime=(d=new Date())=>({time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date:((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()});
const writeChunk=(res,buf)=>new Promise((resolve,reject)=>{const onError=e=>{res.off('drain',onDrain);reject(e)},onDrain=()=>{res.off('error',onError);resolve()};res.once('error',onError);if(res.write(buf))onDrain();else res.once('drain',onDrain)});
async function streamTransferZip(res,transfer,files){
  res.writeHead(200,{'content-type':'application/zip','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(transfer.title+'.zip')}`,'cache-control':'no-store'});let offset=0;const central=[];const dt=dosDateTime();
  for(const file of files){const name=Buffer.from(file.relative_path,'utf8'),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x808,6);local.writeUInt16LE(dt.time,10);local.writeUInt16LE(dt.date,12);local.writeUInt16LE(name.length,26);const localOffset=offset;await writeChunk(res,local);await writeChunk(res,name);offset+=30+name.length;let crc=0xffffffff;for await(const chunk of fs.createReadStream(path.join(filesDir,transfer.id,file.stored_name))){crc=crcUpdate(crc,chunk);await writeChunk(res,chunk);offset+=chunk.length}crc=(crc^0xffffffff)>>>0;const desc=Buffer.alloc(16);desc.writeUInt32LE(0x08074b50);desc.writeUInt32LE(crc,4);desc.writeUInt32LE(Number(file.size),8);desc.writeUInt32LE(Number(file.size),12);await writeChunk(res,desc);offset+=16;central.push({name,crc,size:Number(file.size),offset:localOffset})}
  const start=offset;for(const e of central){const h=Buffer.alloc(46);h.writeUInt32LE(0x02014b50);h.writeUInt16LE(20,4);h.writeUInt16LE(20,6);h.writeUInt16LE(0x808,8);h.writeUInt16LE(dt.time,12);h.writeUInt16LE(dt.date,14);h.writeUInt32LE(e.crc,16);h.writeUInt32LE(e.size,20);h.writeUInt32LE(e.size,24);h.writeUInt16LE(e.name.length,28);h.writeUInt32LE(e.offset,42);await writeChunk(res,h);await writeChunk(res,e.name);offset+=46+e.name.length}const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(central.length,8);end.writeUInt16LE(central.length,10);end.writeUInt32LE(offset-start,12);end.writeUInt32LE(start,16);await writeChunk(res,end);res.end();
}

async function serveStatic(req,res,url){
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const full = path.resolve(root, 'public', requested);
  const publicRoot = path.resolve(root,'public');
  if(!full.startsWith(publicRoot)) return false;
  try { const st=await fsp.stat(full); if(!st.isFile()) return false; const ext=path.extname(full); const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'}; res.writeHead(200,{'content-type':types[ext]||'application/octet-stream','cache-control':ext==='.html'?'no-cache':'public, max-age=3600'}); fs.createReadStream(full).pipe(res); return true; } catch { return false; }
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  try {
    if(req.method==='POST'&&url.pathname==='/api/register'){
      if(!isPrivateIp(req.socket.remoteAddress)) return json(res,403,{error:'ثبت‌نام فقط از شبکه داخلی مجاز است'});
      const b=await readJson(req); const name=safeName(b.name); const pin=String(b.pin||'');
      if(name.length<2) return json(res,400,{error:'نام باید حداقل ۲ حرف باشد'});
      if(!/^\d{6,12}$/.test(pin)) return json(res,400,{error:'PIN باید بین ۶ تا ۱۲ رقم باشد'});
      if(config.registrationCode && b.registrationCode!==config.registrationCode) return json(res,403,{error:'کد ثبت‌نام نادرست است'});
      const id=randomId(); const count=Number(db.prepare('SELECT COUNT(*) n FROM users').get().n); const role=count===0?'admin':'user';
      try{db.prepare('INSERT INTO users(id,name,pin_hash,role,created_at,last_seen,blocked) VALUES(?,?,?,?,?,?,0)').run(id,name,hashPin(pin),role,Date.now(),Date.now());}catch(e){if(String(e).includes('UNIQUE'))return json(res,409,{error:'این نام قبلاً ثبت شده است'});throw e;}audit(req,{id},'register','user',id,name);
      return createSession(res,id,{id,name,role});
    }
    if(req.method==='POST'&&url.pathname==='/api/login'){
      const b=await readJson(req); const row=db.prepare('SELECT * FROM users WHERE name=? COLLATE NOCASE').get(safeName(b.name));
      if(!row||row.blocked||!verifyPin(String(b.pin||''),row.pin_hash)){audit(req,row||null,'login_failed','user',row?.id||'',safeName(b.name));return json(res,401,{error:'نام یا PIN نادرست است'});}
      db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(Date.now(),row.id);audit(req,row,'login','user',row.id); return createSession(res,row.id,{id:row.id,name:row.name,role:row.role});
    }
    if(req.method==='POST'&&url.pathname==='/api/logout'){const sid=parseCookies(req.headers.cookie).session;if(sid)db.prepare('DELETE FROM sessions WHERE id=?').run(sid);res.writeHead(204,{'set-cookie':'session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});return res.end();}
    if(req.method==='GET'&&url.pathname==='/api/me'){const u=currentUser(req);return json(res,u?200:401,u||{error:'وارد نشده‌اید'});}
    if(req.method==='GET'&&url.pathname==='/api/events'){
      const u=requireUser(req,res);if(!u)return; res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'});res.write('event: ready\ndata: {}\n\n');
      if(!clients.has(u.id))clients.set(u.id,new Set());clients.get(u.id).add(res);db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(Date.now(),u.id);broadcast('presence',{});const timer=setInterval(()=>res.write(': ping\n\n'),20000);req.on('close',()=>{clearInterval(timer);clients.get(u.id)?.delete(res);if(!clients.get(u.id)?.size)clients.delete(u.id);broadcast('presence',{});});return;
    }
    if(req.method==='GET'&&url.pathname==='/api/users'){
      const u=requireUser(req,res);if(!u)return; const rows=db.prepare('SELECT id,name,role,last_seen FROM users WHERE id<>? ORDER BY name').all(u.id).map(x=>({...x,online:clients.has(x.id)}));return json(res,200,rows);
    }
    if(req.method==='GET'&&url.pathname==='/api/transfers'){
      const u=requireUser(req,res);if(!u)return; const rows=db.prepare(`SELECT t.id,t.title,t.status,t.created_at,t.total_bytes,s.name sender_name,t.sender_id,COUNT(DISTINCT f.id) file_count,GROUP_CONCAT(DISTINCT ru.name) recipients FROM transfers t JOIN users s ON s.id=t.sender_id LEFT JOIN transfer_files f ON f.transfer_id=t.id LEFT JOIN recipients r ON r.transfer_id=t.id LEFT JOIN users ru ON ru.id=r.user_id WHERE t.sender_id=? OR r.user_id=? OR ?='admin' GROUP BY t.id ORDER BY t.created_at DESC`).all(u.id,u.id,u.role);return json(res,200,rows);
    }
    if(req.method==='GET'&&/^\/api\/transfers\/[^/]+\/files$/.test(url.pathname)){
      const u=requireUser(req,res);if(!u)return;const id=url.pathname.split('/')[3];if(!canAccessTransfer(u,id))return json(res,403,{error:'دسترسی ندارید'});return json(res,200,db.prepare('SELECT id,relative_path,size FROM transfer_files WHERE transfer_id=? AND uploaded=size ORDER BY relative_path').all(id));
    }
    if(req.method==='POST'&&url.pathname==='/api/uploads'){
      const u=requireUser(req,res);if(!u)return;const b=await readJson(req);if(!Array.isArray(b.files)||!b.files.length)return json(res,400,{error:'فایلی انتخاب نشده است'});if(!Array.isArray(b.recipients)||!b.recipients.length)return json(res,400,{error:'گیرنده‌ای انتخاب نشده است'});
      const files=b.files.map(x=>({path:safeRelativePath(x.path),size:Number(x.size)}));if(files.some(x=>!Number.isSafeInteger(x.size)||x.size<0||x.size>config.maxFileBytes))return json(res,400,{error:'اندازه یکی از فایل‌ها مجاز نیست'});const total=files.reduce((a,x)=>a+x.size,0);if(storageUsed()+total>config.storageLimitBytes-config.reserveBytes)return json(res,507,{error:'فضای میزبان برای این ارسال کافی نیست'});
      const validRecipients=db.prepare(`SELECT id FROM users WHERE id IN (${b.recipients.map(()=>'?').join(',')})`).all(...b.recipients).map(x=>x.id);if(!validRecipients.length)return json(res,400,{error:'گیرنده معتبر نیست'});
      const id=randomId();db.exec('BEGIN');try{db.prepare('INSERT INTO transfers VALUES(?,?,?,?,?,?)').run(id,u.id,safeName(b.title)||files[0].path,'uploading',Date.now(),total);const insert=db.prepare('INSERT INTO transfer_files VALUES(?,?,?,?,?,0)');const result=[];for(const f of files){const fid=randomId();const stored=randomId(24);insert.run(fid,id,f.path,stored,f.size);result.push({id:fid,path:f.path,size:f.size,uploaded:0});}const ir=db.prepare('INSERT INTO recipients VALUES(?,?,NULL,0)');for(const rid of validRecipients)ir.run(id,rid);db.exec('COMMIT');audit(req,u,'upload_created','transfer',id,JSON.stringify({total,recipients:validRecipients.length}));return json(res,201,{id,files:result});}catch(e){db.exec('ROLLBACK');throw e;}
    }
    if(req.method==='GET'&&/^\/api\/uploads\/[^/]+$/.test(url.pathname)){
      const u=requireUser(req,res);if(!u)return;const id=url.pathname.split('/')[3];const t=db.prepare("SELECT * FROM transfers WHERE id=? AND sender_id=? AND status='uploading'").get(id,u.id);if(!t)return json(res,404,{error:'آپلود نیمه‌کاره پیدا نشد'});return json(res,200,{id,title:t.title,files:db.prepare('SELECT id,relative_path path,size,uploaded FROM transfer_files WHERE transfer_id=? ORDER BY rowid').all(id)});
    }
    if(req.method==='PUT'&&/^\/api\/uploads\/[^/]+\/files\/[^/]+$/.test(url.pathname)){
      const u=requireUser(req,res);if(!u)return;const [, , ,transferId,,fileId]=url.pathname.split('/');const row=db.prepare('SELECT f.*,t.sender_id FROM transfer_files f JOIN transfers t ON t.id=f.transfer_id WHERE f.id=? AND f.transfer_id=?').get(fileId,transferId);if(!row||row.sender_id!==u.id)return json(res,403,{error:'دسترسی ندارید'});const offset=Number(req.headers['x-upload-offset']||0);if(offset!==Number(row.uploaded))return json(res,409,{error:'موقعیت آپلود نادرست است',offset:row.uploaded});const remaining=Number(row.size)-offset;const target=path.join(tempDir,row.stored_name);const handle=await fsp.open(target,offset===0?'w':'r+');let written=0;try{for await(const chunk of req){if(written+chunk.length>remaining)throw new Error('داده بیشتر از اندازه اعلام‌شده است');await handle.write(chunk,0,chunk.length,offset+written);written+=chunk.length;}}finally{await handle.close();}db.prepare('UPDATE transfer_files SET uploaded=uploaded+? WHERE id=?').run(written,fileId);return json(res,200,{offset:offset+written,complete:offset+written===Number(row.size)});
    }
    if(req.method==='POST'&&/^\/api\/uploads\/[^/]+\/complete$/.test(url.pathname)){
      const u=requireUser(req,res);if(!u)return;const id=url.pathname.split('/')[3];const t=db.prepare('SELECT * FROM transfers WHERE id=?').get(id);if(!t||t.sender_id!==u.id)return json(res,403,{error:'دسترسی ندارید'});const pending=Number(db.prepare('SELECT COUNT(*) n FROM transfer_files WHERE transfer_id=? AND uploaded<>size').get(id).n);if(pending)return json(res,409,{error:'آپلود هنوز کامل نشده است'});const rows=db.prepare('SELECT * FROM transfer_files WHERE transfer_id=?').all(id);await fsp.mkdir(path.join(filesDir,id),{recursive:true});for(const f of rows)await fsp.rename(path.join(tempDir,f.stored_name),path.join(filesDir,id,f.stored_name));db.prepare("UPDATE transfers SET status='ready' WHERE id=?").run(id);const recipients=db.prepare('SELECT user_id FROM recipients WHERE transfer_id=?').all(id).map(x=>x.user_id);audit(req,u,'upload_completed','transfer',id);broadcast('transfer',{id,title:t.title,sender:u.name},recipients);return json(res,200,{ok:true});
    }
    if(req.method==='GET'&&/^\/api\/files\/[^/]+\/download$/.test(url.pathname)){
      const u=requireUser(req,res);if(!u)return;const fid=url.pathname.split('/')[3];const f=db.prepare('SELECT f.*,t.sender_id,t.id transfer_id FROM transfer_files f JOIN transfers t ON t.id=f.transfer_id WHERE f.id=? AND t.status=\'ready\'').get(fid);if(!f||!canAccessTransfer(u,f.transfer_id))return json(res,403,{error:'دسترسی ندارید'});db.prepare('UPDATE recipients SET download_count=download_count+1,seen_at=COALESCE(seen_at,?) WHERE transfer_id=? AND user_id=?').run(Date.now(),f.transfer_id,u.id);const full=path.join(filesDir,f.transfer_id,f.stored_name);res.writeHead(200,{'content-type':'application/octet-stream','content-length':f.size,'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(path.basename(f.relative_path))}`});return fs.createReadStream(full).pipe(res);
    }
    if(req.method==='GET'&&/^\/api\/transfers\/[^/]+\/archive$/.test(url.pathname)){
      const u=requireUser(req,res);if(!u)return;const id=url.pathname.split('/')[3];if(!canAccessTransfer(u,id))return json(res,403,{error:'دسترسی ندارید'});const t=db.prepare("SELECT * FROM transfers WHERE id=? AND status='ready'").get(id);if(!t)return json(res,404,{error:'ارسال پیدا نشد'});const files=db.prepare('SELECT * FROM transfer_files WHERE transfer_id=? AND uploaded=size ORDER BY relative_path').all(id);audit(req,u,'archive_download','transfer',id);return streamTransferZip(res,t,files);
    }
    if(req.method==='DELETE'&&/^\/api\/transfers\/[^/]+$/.test(url.pathname)){
      const u=requireUser(req,res);if(!u)return;const id=url.pathname.split('/')[3];const t=db.prepare('SELECT * FROM transfers WHERE id=?').get(id);if(!t||!(t.sender_id===u.id||u.role==='admin'))return json(res,403,{error:'فقط فرستنده یا مدیر می‌تواند حذف کند'});await fsp.rm(path.join(filesDir,id),{recursive:true,force:true});for(const f of db.prepare('SELECT stored_name FROM transfer_files WHERE transfer_id=?').all(id))await fsp.rm(path.join(tempDir,f.stored_name),{force:true});db.prepare('DELETE FROM transfers WHERE id=?').run(id);audit(req,u,'transfer_deleted','transfer',id,t.title);broadcast('deleted',{id});return json(res,200,{ok:true});
    }
    if(req.method==='GET'&&url.pathname==='/api/admin/storage'){
      const u=requireUser(req,res);if(!u)return;if(u.role!=='admin')return json(res,403,{error:'فقط مدیر'});return json(res,200,{used:storageUsed(),limit:config.storageLimitBytes,reserve:config.reserveBytes});
    }
    if(req.method==='GET'&&url.pathname==='/api/admin/users'){
      const u=requireUser(req,res);if(!u)return;if(u.role!=='admin')return json(res,403,{error:'فقط مدیر'});return json(res,200,db.prepare(`SELECT u.id,u.name,u.role,u.blocked,u.created_at,u.last_seen,COALESCE(SUM(CASE WHEN t.status='ready' THEN t.total_bytes ELSE 0 END),0) storage FROM users u LEFT JOIN transfers t ON t.sender_id=u.id GROUP BY u.id ORDER BY u.name`).all());
    }
    if(req.method==='PATCH'&&/^\/api\/admin\/users\/[^/]+$/.test(url.pathname)){
      const u=requireUser(req,res);if(!u)return;if(u.role!=='admin')return json(res,403,{error:'فقط مدیر'});const id=url.pathname.split('/')[4],b=await readJson(req);const target=db.prepare('SELECT * FROM users WHERE id=?').get(id);if(!target)return json(res,404,{error:'کاربر پیدا نشد'});if(id===u.id&&b.blocked)return json(res,400,{error:'نمی‌توانید حساب خودتان را مسدود کنید'});if(b.role&&['user','admin'].includes(b.role))db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role,id);if(typeof b.blocked==='boolean'){db.prepare('UPDATE users SET blocked=? WHERE id=?').run(b.blocked?1:0,id);if(b.blocked)db.prepare('DELETE FROM sessions WHERE user_id=?').run(id)}if(b.pin){if(!/^\d{6,12}$/.test(String(b.pin)))return json(res,400,{error:'PIN باید ۶ تا ۱۲ رقم باشد'});db.prepare('UPDATE users SET pin_hash=? WHERE id=?').run(hashPin(String(b.pin)),id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id)}audit(req,u,'user_updated','user',id,JSON.stringify({role:b.role,blocked:b.blocked,pin:!!b.pin}));return json(res,200,{ok:true});
    }
    if(req.method==='GET'&&url.pathname==='/api/admin/audit'){
      const u=requireUser(req,res);if(!u)return;if(u.role!=='admin')return json(res,403,{error:'فقط مدیر'});return json(res,200,db.prepare(`SELECT a.*,u.name actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100`).all());
    }
    if(req.method==='GET'&&await serveStatic(req,res,url))return;
    json(res,404,{error:'پیدا نشد'});
  }catch(e){console.error(e);if(!res.headersSent)json(res,500,{error:e.message||'خطای داخلی'});else res.destroy();}
});

function createSession(res,userId,user){const sid=randomId(32);const maxAge=30*24*3600;db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(sid,userId,Date.now(),Date.now()+maxAge*1000);res.setHeader('set-cookie',`session=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`);json(res,200,user);}
server.listen(config.port,config.host,()=>{console.log(`Drop: http://localhost:${config.port}`);startLocalName(String(config.localName||'drop').replace(/[^a-z0-9-]/gi,'').toLowerCase()||'drop')});
export { server };
