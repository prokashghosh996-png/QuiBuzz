import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

export const db = new PrismaClient({
  transactionOptions: {
    maxWait: 10000, // default is 2000ms
    timeout: 30000, // default is 5000ms
  },
});
