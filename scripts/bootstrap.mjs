#!/usr/bin/env node
// One-command local setup: .env, infrastructure, databases, storage buckets, migrations and seed data.
//
//   pnpm bootstrap              full setup (safe to re-run)
//   pnpm bootstrap --infra-only only start and wait for Docker services
//
// Written in plain Node (no shell strings) because the project path may contain spaces.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const infraOnly = process.argv.includes('--infra-only');

/** Databases and buckets per environment. Dev is seeded; test and e2e start empty. */
const ENVIRONMENTS = [
  { name: 'dev', database: 'aiart', bucket: 'aiart-dev', seed: true },
  { name: 'test', database: 'aiart_test', bucket: 'aiart-test', seed: false },
  { name: 'e2e', database: 'aiart_e2e', bucket: 'aiart-e2e', seed: false },
];

function run(cmd, args, { capture = false, allowFail = false } = {}) {
  const res = spawnSync(cmd, args, { cwd: root, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.status !== 0 && !allowFail) {
    throw new Error(`\`${cmd} ${args.join(' ')}\` exited with ${res.status}\n${res.stderr ?? ''}`);
  }
  return res;
}

/** Runs a TypeScript script through tsx without going through a shell. */
function tsx(script, env = {}) {
  const res = spawnSync(process.execPath, ['--import', 'tsx', script], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (res.status !== 0) throw new Error(`${script} failed (exit ${res.status})`);
}

async function waitFor(label, check, timeoutMs = 120_000) {
  const started = Date.now();
  process.stdout.write(`  waiting for ${label} `);
  while (Date.now() - started < timeoutMs) {
    try {
      if (await check()) {
        console.log('ok');
        return;
      }
    } catch {
      // not ready yet
    }
    process.stdout.write('.');
    await sleep(1000);
  }
  throw new Error(`${label} was not ready after ${timeoutMs / 1000}s`);
}

const composeExec = (service, args) =>
  run('docker', ['compose', 'exec', '-T', service, ...args], { capture: true, allowFail: true });

function step(title) {
  console.log(`\n> ${title}`);
}

async function main() {
  step('Environment file');
  if (existsSync(join(root, '.env'))) {
    console.log('  .env exists, leaving it unchanged');
  } else {
    copyFileSync(join(root, '.env.example'), join(root, '.env'));
    console.log('  created .env from .env.example');
  }

  step('Docker');
  if (run('docker', ['info'], { capture: true, allowFail: true }).status !== 0) {
    throw new Error('Docker is not running. Start Docker Desktop and run `pnpm bootstrap` again.');
  }
  run('docker', ['compose', 'up', '-d']);

  await waitFor(
    'postgres',
    () => composeExec('postgres', ['pg_isready', '-U', 'aiart', '-d', 'aiart']).status === 0,
  );
  await waitFor('redis', () => composeExec('redis', ['redis-cli', 'ping']).stdout?.includes('PONG'));
  await waitFor('storage', async () => (await fetch('http://localhost:9000/minio/health/live')).ok);

  step('Databases');
  for (const env of ENVIRONMENTS) {
    const exists = composeExec('postgres', [
      'psql',
      '-U',
      'aiart',
      '-d',
      'aiart',
      '-tAc',
      `SELECT 1 FROM pg_database WHERE datname='${env.database}'`,
    ]).stdout?.trim();
    if (exists === '1') {
      console.log(`  ${env.database} exists`);
    } else {
      run('docker', ['compose', 'exec', '-T', 'postgres', 'createdb', '-U', 'aiart', env.database]);
      console.log(`  created ${env.database}`);
    }
  }

  if (infraOnly) {
    console.log('\nInfrastructure is up (--infra-only).');
    return;
  }

  const dbUrl = (database) => `postgres://aiart:aiart@localhost:5433/${database}`;

  step('Storage buckets');
  for (const env of ENVIRONMENTS) {
    tsx('packages/core/scripts/init-storage.ts', { S3_BUCKET: env.bucket });
  }

  step('Migrations');
  for (const env of ENVIRONMENTS) {
    console.log(`  ${env.database}`);
    tsx('packages/core/scripts/migrate.ts', { DATABASE_URL: dbUrl(env.database) });
  }

  step('Seed data');
  for (const env of ENVIRONMENTS.filter((e) => e.seed)) {
    tsx('packages/core/scripts/seed.ts', { DATABASE_URL: dbUrl(env.database), S3_BUCKET: env.bucket });
  }

  console.log('\nDone. Start everything with `pnpm dev`.');
}

main().catch((err) => {
  console.error(`\nbootstrap failed: ${err.message}`);
  process.exit(1);
});
