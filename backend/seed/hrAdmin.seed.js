/**
 * Seed script: Create SUPER USER + 10 test users
 * Run with: node seed/hrAdmin.seed.js
 *
 * Updated: users now require a `username` field (used for login).
 * Default password meets the complexity policy:
 *   8+ chars, uppercase, lowercase, digit, special character.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

dotenv.config({ path: '../.env' });

const MONGO_URI = process.env.MONGO_URI;

const ALL_ROLES = ['HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE'];

const DEPARTMENTS = ['IT Support', 'Software Development'];

const POSITIONS = ['IT Officer 2', 'IT Officer', 'Senior'];

// Meets complexity: uppercase + lowercase + digit + special char + 8+ chars
const DEFAULT_PASSWORD = 'Zemen@2026';

const seedUsers = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected');

    // ─── 1. SUPER USER ───────────────────────────────────────────────────────
    const superEmail    = 'tesfayemikiyas14@gmail.com';
    const superUsername = 'mickey.s';

    const existingSuper = await User.findOne({
      $or: [{ email: superEmail }, { username: superUsername }],
    });

    if (!existingSuper) {
      await User.create({
        employeeId:   'SYS-ADMIN-001',
        name:         'System Super User',
        username:     superUsername,      // login credential
        email:        superEmail,
        gender:       'Male',
        passwordHash: DEFAULT_PASSWORD,   // pre-save hook hashes it
        roles:        ALL_ROLES,
        position:     'Senior',
        department:   'IT Support',
        supervisorId: null,
        status:       'ACTIVE',
      });
      console.log(`🎉 SUPER USER created  (username: ${superUsername})`);
    } else {
      console.log('ℹ️  Super user already exists — skipped');
    }

    // ─── 2. SUPERVISOR (so test employees have someone to report to) ─────────
    const supervisorUsername = 'supervisor.1';
    const supervisorEmail    = 'supervisor1@example.com';

    let supervisorDoc = await User.findOne({
      $or: [{ email: supervisorEmail }, { username: supervisorUsername }],
    });

    if (!supervisorDoc) {
      supervisorDoc = await User.create({
        employeeId:   'EMP-SUP-001',
        name:         'Test Supervisor 1',
        username:     supervisorUsername,
        email:        supervisorEmail,
        gender:       'Male',
        passwordHash: DEFAULT_PASSWORD,
        roles:        ['SUPERVISOR'],
        position:     'Senior',
        department:   'IT Support',
        supervisorId: null,
        status:       'ACTIVE',
      });
      console.log(`✅ Created supervisor  (username: ${supervisorUsername})`);
    } else {
      console.log(`ℹ️  Supervisor already exists — skipped`);
    }

    // ─── 3. 10 TEST USERS ────────────────────────────────────────────────────
    for (let i = 1; i <= 10; i++) {
      const email    = `user${i}@example.com`;
      const username = `user.${i}`;                 // e.g. user.1, user.2 …
      const isSuper  = i % 3 === 0;                 // every 3rd user is SUPERVISOR role

      const exists = await User.findOne({
        $or: [{ email }, { username }],
      });

      if (!exists) {
        await User.create({
          employeeId:   `EMP-00${i}`,
          name:         `Test User ${i}`,
          username,
          email,
          gender:       i % 2 === 0 ? 'Female' : 'Male',
          passwordHash: DEFAULT_PASSWORD,
          roles:        [isSuper ? 'SUPERVISOR' : 'EMPLOYEE'],
          position:     POSITIONS[i % POSITIONS.length],
          department:   DEPARTMENTS[i % DEPARTMENTS.length],
          supervisorId: isSuper ? null : supervisorDoc._id,
          status:       'ACTIVE',
        });
        console.log(`✅ Created  username: ${username.padEnd(10)}  email: ${email}`);
      } else {
        console.log(`ℹ️  Exists   username: ${username.padEnd(10)}  email: ${email}`);
      }
    }

    // ─── Summary ─────────────────────────────────────────────────────────────
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Seeding completed successfully');
    console.log('');
    console.log('🔑 Default password for ALL users:');
    console.log(`   ${DEFAULT_PASSWORD}`);
    console.log('');
    console.log('👤 Login credentials (username → role):');
    console.log(`   sys.admin     → HR_ADMIN + SUPERVISOR + EMPLOYEE`);
    console.log(`   supervisor.1  → SUPERVISOR`);
    console.log(`   user.1 … user.10 → EMPLOYEE (every 3rd: SUPERVISOR)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
};

seedUsers();
