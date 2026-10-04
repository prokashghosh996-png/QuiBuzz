import { createDemo } from '../server/service.js';
import { db } from '../server/db.js';
try {
  const q = await createDemo();
  console.log(`Demo quiz created: /quiz/${q.id}`);
} finally {
  await db.$disconnect();
}
