import { app } from './app.js';
import { db } from './db.js';
const server = app.listen(Number(process.env.PORT) || 3001, process.env.HOST || '0.0.0.0', () =>
  console.log(`QuiBuzz API listening on port ${process.env.PORT || 3001}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => {
      void db.$disconnect().then(() => process.exit(0));
    });
  });
