const { DB_FILE, updateState } = require('./repository');
const { createSeedState } = require('./seed-data');

(async () => {
  const seeded = createSeedState();
  await updateState((state) => {
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, seeded);
  });
  console.log(`Seed data written to ${DB_FILE}`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
