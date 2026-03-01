/**
 * Seed script: Create SUPER USER + 10 test users
 * Run with: node seed/hrAdmin.seed.js
 */
////5f5e4fcb1024428e7867
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const ALL_ROLES = ['HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE'];

const DEPARTMENTS = ['IT Support', 'Software Development'];

const POSITIONS = ['IT Officer 2', 'IT Officer', 'Senior'];

const DEFAULT_PASSWORD = '12345678';

const seedUsers = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected');

    // -------------------------
    // 1️⃣ SUPER USER
    // -------------------------
    const superEmail = 'mesfin8109@gmail.com';

    const existingSuper = await User.findOne({ email: superEmail });

    if (!existingSuper) {
      await User.create({
        employeeId: 'SYS-ADMIN-001',
        name: 'System Super User',
        email: superEmail,
        gender: 'Male',
        passwordHash: DEFAULT_PASSWORD, // assuming pre-save hook hashes it
        roles: ALL_ROLES,
        position: 'Senior',
        department: 'IT Support',
        supervisorId: null,
        status: 'ACTIVE'
      });

      console.log('🎉 SUPER USER created');
    } else {
      console.log('ℹ️ Super user already exists');
    }

    // -------------------------
    // 2️⃣ CREATE 10 USERS
    // -------------------------

    const users = [];

    for (let i = 1; i <= 10; i++) {
      users.push({
        employeeId: `EMP-00${i}`,
        name: `Test User ${i}`,
        email: `user${i}@example.com`,
        gender: i % 2 === 0 ? 'Female' : 'Male',
        passwordHash: DEFAULT_PASSWORD,
        roles: [i % 3 === 0 ? 'SUPERVISOR' : 'EMPLOYEE'],
        position: POSITIONS[i % POSITIONS.length],
        department: DEPARTMENTS[i % DEPARTMENTS.length],
        supervisorId: null,
        status: 'ACTIVE'
      });
    }

    for (const user of users) {
      const exists = await User.findOne({ email: user.email });
      if (!exists) {
        await User.create(user);
        console.log(`✅ Created: ${user.email}`);
      } else {
        console.log(`ℹ️ Exists: ${user.email}`);
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Seeding completed successfully');
    console.log('🔑 Default Password for ALL users: 12345678');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
};

seedUsers();