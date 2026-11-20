import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../packages/config/dist/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const config = loadConfig();
const pidFile = new URL('../.cyris-dev-pids', import.meta.url);
const children = new Map();
let stopping = false;
let ownsPidFile = false;

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`Port ${port} is in use. Stop the existing process before starting CYRIS.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}

async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  const owned = [...children.values()].filter((child) => Number.isSafeInteger(child.pid));
  const pending = owned.filter((child) => child.exitCode === null && child.signalCode === null);
  const send = (child, signal) => {
    try { process.kill(-child.pid, signal); } catch (error) {
      if (error.code !== 'ESRCH') console.error(`[CYRIS] Could not stop owned process ${child.pid}: ${error.message}`);
    }
  };
  const completed = Promise.all(pending.map((child) => new Promise((resolve) => child.once('exit', resolve))));
  for (const child of owned) send(child, 'SIGTERM');
  const groupIsAlive = (child) => {
    try { process.kill(-child.pid, 0); return true; }
    catch (error) { return error.code !== 'ESRCH'; }
  };
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && owned.some(groupIsAlive)) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const child of owned.filter(groupIsAlive)) send(child, 'SIGKILL');
  await completed;
  if (ownsPidFile) {
    try { unlinkSync(pidFile); } catch (error) { if (error.code !== 'ENOENT') console.error(error.message); }
  }
  process.exit(code);
}

process.once('SIGINT', () => void shutdown(130));
process.once('SIGTERM', () => void shutdown(143));

async function healthy(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(2500) })).ok; }
  catch { return false; }
}

async function main() {
  try {
    const stale = readFileSync(pidFile, 'utf8').trim().split('\n');
    for (const line of stale) {
      const [role, value] = line.split(' ');
      const pid = Number(value);
      if (!['api', 'worker', 'web'].includes(role) || !Number.isSafeInteger(pid) || pid < 2) continue;
      try { process.kill(pid, 0); }
      catch (error) { if (error.code === 'ESRCH') continue; throw error; }
      throw new Error(`A managed ${role} process is still running (PID ${pid}). Stop that development session first.`);
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }

  await Promise.all([assertPortAvailable(config.PORT), assertPortAvailable(3000)]);
  for (const role of ['api', 'worker', 'web']) {
    const child = spawn('pnpm', [`dev:${role}`], {
      cwd: root,
      stdio: 'inherit',
      detached: true,
      env: { ...process.env, API_INTERNAL_URL: `http://127.0.0.1:${config.PORT}` },
    });
    children.set(role, child);
    child.once('error', (error) => {
      console.error(`[CYRIS] ${role} could not start: ${error.message}`);
      void shutdown(1);
    });
    child.once('exit', (code, signal) => {
      if (!stopping) {
        console.error(`[CYRIS] ${role} exited unexpectedly (${signal ?? code}). Stopping this development session.`);
        void shutdown(1);
      }
    });
  }
  writeFileSync(pidFile, [...children].map(([role, child]) => `${role} ${child.pid}\n`).join(''), { mode: 0o600 });
  ownsPidFile = true;

  for (let attempt = 0; attempt < 90 && !stopping; attempt++) {
    const checks = await Promise.all([
      healthy(`http://127.0.0.1:${config.PORT}/health/ready`),
      healthy('http://127.0.0.1:3000/'),
    ]);
    if (checks.every(Boolean)) {
      console.log(`[CYRIS] Web and API readiness checks passed. Open http://localhost:3000 (API :${config.PORT}).`);
      console.log('[CYRIS] Worker process is supervised; pnpm dev:status reports its process state. Ctrl+C stops all application process groups.');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!stopping) throw new Error('Web/API did not become ready. Inspect the application errors above.');
}

main().catch((error) => {
  console.error(`[CYRIS] ${error.message}`);
  void shutdown(1);
});
