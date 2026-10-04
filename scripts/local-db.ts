import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const directory = resolve('.data/postgres');
const pg = new EmbeddedPostgres({
  databaseDir: directory,
  user: 'quibuzz',
  password: 'quibuzz_local',
  port: 54329,
  persistent: true,
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: (message) => {
    if (String(message).includes('FATAL')) console.error(message);
  },
});
if (!existsSync(resolve(directory, 'PG_VERSION'))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const found = await client.query("SELECT 1 FROM pg_database WHERE datname = 'quibuzz'");
await client.end();
if (!found.rowCount) await pg.createDatabase('quibuzz');
console.log(
  'PostgreSQL is ready on 127.0.0.1:54329. Data persists in .data/postgres. Keep this terminal open.',
);
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 60000);
