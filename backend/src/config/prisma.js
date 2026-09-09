/* config/prisma.js
 * Single Prisma client instance shared across the app.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;
