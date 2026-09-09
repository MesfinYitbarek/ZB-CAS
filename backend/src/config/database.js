import logger from '../utils/logger.js';
/* config/database.js
 * Verifies connectivity to PostgreSQL via Prisma.
 * Hard-exits if the database is unreachable (matches previous Mongoose behavior).
 */
const connectDB = async () => {
  try {
    const prisma = (await import('./prisma.js')).default;
    // Simple query to confirm the connection is live before booting the server.
    await prisma.$queryRaw`SELECT 1`;
    logger.info({ event: 'db_connected' });
  } catch (error) {
    console.error('[DB] Connection failed:', error.message);
    process.exit(1);             // hard exit – can't run without DB
  }
};

export default connectDB;
