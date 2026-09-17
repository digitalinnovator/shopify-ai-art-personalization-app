#!/usr/bin/env node
// Runs the API, worker, storefront harness and admin panel together, with each line prefixed by
// its service name. Ctrl-C stops all of them. Requires `pnpm bootstrap` to have been run once.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const services = [
  {
    name: 'api',
    color: 35,
    cwd: 'apps/api',
    cmd: process.execPath,
    args: ['--import', 'tsx', 'src/server.ts'],
  },
  {
    name: 'worker',
    color: 36,
    cwd: 'apps/worker',
    cmd: process.execPath,
    args: ['--import', 'tsx', 'src/server.ts'],
  },
  {
    name: 'storefront',
    color: 33,
    cwd: 'apps/storefront',
    cmd: process.execPath,
    args: ['--import', 'tsx', 'node_modules/vite/bin/vite.js'],
  },
  {
    name: 'admin',
    color: 32,
    cwd: 'apps/shopify-app',
    cmd: process.execPath,
    args: ['--import', 'tsx', 'node_modules/@react-router/dev/bin.js', 'dev'],
  },
];

const width = Math.max(...services.map((s) => s.name.length));
const children = [];

function prefix(service, text) {
  const label = `\x1b[${service.color}m${service.name.padEnd(width)}\x1b[0m`;
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => `${label} | ${line}`)
    .join('\n');
}

for (const service of services) {
  const child = spawn(service.cmd, service.args, {
    cwd: join(root, service.cwd),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (buf) => process.stdout.write(`${prefix(service, buf.toString())}\n`));
  child.stderr.on('data', (buf) => process.stderr.write(`${prefix(service, buf.toString())}\n`));
  child.on('exit', (code) => {
    console.log(prefix(service, `exited (${code})`));
  });
  children.push(child);
}

console.log(`Started ${services.map((s) => s.name).join(', ')}. Press Ctrl+C to stop everything.`);
console.log('  admin       http://localhost:3000');
console.log('  api docs    http://localhost:4000/docs');
console.log('  storefront  http://localhost:5173');

function shutdown() {
  for (const child of children) child.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
