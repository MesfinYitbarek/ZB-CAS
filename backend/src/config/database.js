/* config/database.js
 * Establishes a single Mongoose connection to MongoDB Atlas.
 * Uses connection-pooling defaults and TLS enforcement (Atlas enforces TLS anyway).
 */
import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // --- connection-pool tuning ---
      maxPoolSize: 10,        // max simultaneous connections
      minPoolSize: 2,
      socketTimeoutMS: 5000,  // how long the driver waits on a socket op
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`[DB] MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('[DB] Connection failed:', error.message);
    process.exit(1);             // hard exit – can't run without DB
  }
};

export default connectDB;