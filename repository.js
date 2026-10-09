const fs = require('node:fs/promises');
const path = require('node:path');
const { createSeedState, isValidState } = require('./seed-data');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
let writeQueue = Promise.resolve();

async function atomicWrite(state) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temp = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await fs.rename(temp, DB_FILE);
}

async function ensureDatabase() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const parsed = JSON.parse(await fs.readFile(DB_FILE, 'utf8'));
    if (isValidState(parsed)) return;
  } catch {}
  await atomicWrite(createSeedState());
}

async function getState() {
  await writeQueue;
  await ensureDatabase();
  return JSON.parse(await fs.readFile(DB_FILE, 'utf8'));
}

function updateState(mutator) {
  const operation = writeQueue.then(async () => {
    await ensureDatabase();
    const state = JSON.parse(await fs.readFile(DB_FILE, 'utf8'));
    const result = await mutator(state);
    await atomicWrite(state);
    return result;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

module.exports = { DB_FILE, ensureDatabase, getState, updateState };
