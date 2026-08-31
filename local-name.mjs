import dgram from 'node:dgram';
import os from 'node:os';

const virtual = /loopback|vethernet|wsl|docker|vmware|virtualbox|hyper-v|tailscale/i;

export function getLanAddresses() {
  const groups = Object.entries(os.networkInterfaces());
  const collect = entries => entries.flatMap(([, list]) => (list || []).filter(x => x.family === 'IPv4' && !x.internal && !x.address.startsWith('169.254.')).map(x => x.address));
  const physical = collect(groups.filter(([name]) => !virtual.test(name)));
  return [...new Set(physical.length ? physical : collect(groups))];
}

const encodeName = name => Buffer.concat(name.split('.').map(part => {
  const value = Buffer.from(part, 'utf8');
  return Buffer.concat([Buffer.from([value.length]), value]);
}).concat(Buffer.from([0])));

function readName(packet, start) {
  const parts = []; let offset = start; let next = start;
  while (offset < packet.length) {
    const len = packet[offset];
    if ((len & 0xc0) === 0xc0) { if (next === offset) next = offset + 2; offset = ((len & 0x3f) << 8) | packet[offset + 1]; continue; }
    if (len === 0) { if (next === start) next = offset + 1; break; }
    parts.push(packet.subarray(offset + 1, offset + 1 + len).toString('utf8')); offset += len + 1;
  }
  return { name: parts.join('.').toLowerCase(), next };
}

function answerPacket(hostname, addresses) {
  const name = encodeName(`${hostname}.local`), header = Buffer.alloc(12);
  header.writeUInt16BE(0x8400, 2); header.writeUInt16BE(addresses.length, 6);
  const records = addresses.map(address => {
    const record = Buffer.alloc(10 + 4); record.writeUInt16BE(1, 0); record.writeUInt16BE(0x8001, 2); record.writeUInt32BE(120, 4); record.writeUInt16BE(4, 8);
    address.split('.').forEach((part, i) => { record[10 + i] = Number(part); });
    return Buffer.concat([name, record]);
  });
  return Buffer.concat([header, ...records]);
}

export function startLocalName(hostname = 'drop') {
  const addresses = getLanAddresses();
  if (!addresses.length) return null;
  const target = `${hostname}.local`;
  const sockets = addresses.map(address => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('error', error => console.warn(`Local name ${target} on ${address} unavailable: ${error.message}`));
    socket.on('message', packet => {
      try {
        const count = packet.readUInt16BE(4); let offset = 12; let matched = false;
        for (let i = 0; i < count; i++) { const q = readName(packet, offset); offset = q.next; const type = packet.readUInt16BE(offset); offset += 4; if (q.name === target && (type === 1 || type === 255)) matched = true; }
        if (matched) socket.send(answerPacket(hostname, [address]), 5353, '224.0.0.251');
      } catch { /* Ignore malformed multicast packets. */ }
    });
    socket.bind(5353, '0.0.0.0', () => {
      try {
        socket.addMembership('224.0.0.251', address);
        socket.setMulticastInterface(address);
        socket.setMulticastTTL(255);
        socket.send(answerPacket(hostname, [address]), 5353, '224.0.0.251');
        console.log(`Local name on ${address}: http://${target}`);
      } catch (error) { console.warn(`Local name ${target} on ${address} unavailable: ${error.message}`); }
    });
    return socket;
  });
  return sockets;
}
