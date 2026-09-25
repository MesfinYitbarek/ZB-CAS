/* utils/password.js
 * Password hashing / comparison helpers, extracted from the Mongoose
 * User pre-save hook so controllers can call them explicitly with Prisma.
 */
import bcrypt from 'bcryptjs';

// Default password assigned to every newly created user
// (single registration + bulk import). Users are expected to
// change it on first login (see welcome email text).
export const DEFAULT_USER_PASSWORD = 'Zemen123';

export const hashPassword = async (plain) => bcrypt.hash(plain, 12);

export const comparePassword = (candidatePlain, passwordHash) =>
  bcrypt.compare(candidatePlain, passwordHash);
