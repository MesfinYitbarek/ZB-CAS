import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`[seedAdmin] Missing required env var: ${key}`);
  return val;
};

const main = async () => {
  const MONGO_URI = required('MONGO_URI');

  const adminEmployeeId = required('SEED_ADMIN_EMPLOYEE_ID');
  const adminName = required('SEED_ADMIN_NAME');
  const adminEmail = required('SEED_ADMIN_EMAIL').toLowerCase();
  const adminPassword = required('SEED_ADMIN_PASSWORD');

  await mongoose.connect(MONGO_URI);

  const existing = await User.findOne({ email: adminEmail });
  if (existing) {
    const roles = new Set(existing.roles || []);
    roles.add('HR_ADMIN');

    existing.employeeId = existing.employeeId || adminEmployeeId;
    existing.name = existing.name || adminName;
    existing.roles = Array.from(roles);
    existing.status = existing.status || 'ACTIVE';

    await existing.save();
    console.log(`[seedAdmin] Admin already exists. Updated roles for: ${adminEmail}`);
  } else {
    await User.create({
      employeeId: adminEmployeeId,
      name: adminName,
      email: adminEmail,
      passwordHash: adminPassword,
      roles: ['HR_ADMIN'],
      status: 'ACTIVE',
    });

    console.log(`[seedAdmin] Created admin: ${adminEmail}`);
  }

  await mongoose.disconnect();
};

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore
    }
    process.exit(1);
  });
