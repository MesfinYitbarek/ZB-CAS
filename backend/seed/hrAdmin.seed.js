/**
 * Seed script: Create SUPER USER + 10 test users (PostgreSQL / Prisma)
 * Run with: node seed/hrAdmin.seed.js
 *
 * Default password meets the complexity policy:
 *   8+ chars, uppercase, lowercase, digit, special character.
 */
import dotenv from 'dotenv';
import prisma from '../src/config/prisma.js';
import { hashPassword } from '../src/utils/password.js';

dotenv.config({ path: '../.env' });

const ALL_ROLES = ['HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE'];

const DEPARTMENTS = ['IT Support', 'Software Development'];

const POSITIONS = ['IT Officer 2', 'IT Officer', 'Senior'];

// Meets complexity: uppercase + lowercase + digit + special char + 8+ chars
const DEFAULT_PASSWORD = 'Zemen@2026';

const seedUsers = async () => {
  try {
    await prisma.$connect();
    console.log('✅ PostgreSQL connected');

    const passwordHash = await hashPassword(DEFAULT_PASSWORD);

    // ─── 1. SUPER USER ───────────────────────────────────────────────────────
    const superEmail    = 'tesfayemikiyas14@gmail.com';
    const superUsername = 'mickey.s';

    const existingSuper = await prisma.user.findFirst({
      where: { OR: [{ email: superEmail }, { username: superUsername }] },
    });

    if (!existingSuper) {
      await prisma.user.create({
        data: {
          employeeId:   'SYS-ADMIN-001',
          name:         'System Super User',
          username:     superUsername,
          email:        superEmail,
          gender:       'Male',
          passwordHash,
          roles:        ALL_ROLES,
          position:     'Senior',
          department:   'IT Support',
          supervisorId: null,
          status:       'ACTIVE',
        },
      });
      console.log(`🎉 SUPER USER created  (username: ${superUsername})`);
    } else {
      console.log('ℹ️  Super user already exists — skipped');
    }

    // ─── 2. SUPERVISOR ───────────────────────────────────────────────────────
    const supervisorUsername = 'supervisor.1';
    const supervisorEmail    = 'supervisor1@example.com';

    let supervisorDoc = await prisma.user.findFirst({
      where: { OR: [{ email: supervisorEmail }, { username: supervisorUsername }] },
    });

    if (!supervisorDoc) {
      supervisorDoc = await prisma.user.create({
        data: {
          employeeId:   'EMP-SUP-001',
          name:         'Test Supervisor 1',
          username:     supervisorUsername,
          email:        supervisorEmail,
          gender:       'Male',
          passwordHash,
          roles:        ['SUPERVISOR'],
          position:     'Senior',
          department:   'IT Support',
          supervisorId: null,
          status:       'ACTIVE',
        },
      });
      console.log(`✅ Created supervisor  (username: ${supervisorUsername})`);
    } else {
      console.log('ℹ️  Supervisor already exists — skipped');
    }

    // ─── 3. 10 TEST USERS ────────────────────────────────────────────────────
    for (let i = 1; i <= 10; i++) {
      const email    = `user${i}@example.com`;
      const username = `user.${i}`;
      const isSuper  = i % 3 === 0;

      const exists = await prisma.user.findFirst({
        where: { OR: [{ email }, { username }] },
      });

      if (!exists) {
        await prisma.user.create({
          data: {
            employeeId:   `EMP-00${i}`,
            name:         `Test User ${i}`,
            username,
            email,
            gender:       i % 2 === 0 ? 'Female' : 'Male',
            passwordHash,
            roles:        [isSuper ? 'SUPERVISOR' : 'EMPLOYEE'],
            position:     POSITIONS[i % POSITIONS.length],
            department:   DEPARTMENTS[i % DEPARTMENTS.length],
            supervisorId: isSuper ? null : supervisorDoc.id,
            status:       'ACTIVE',
          },
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

    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
};

seedUsers();
