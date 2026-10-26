// One shared database client for the whole app.
// Prisma reads DATABASE_URL from the environment by itself.
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
