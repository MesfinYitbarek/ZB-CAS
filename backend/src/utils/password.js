/* utils/password.js
 * Password hashing / comparison helpers, extracted from the Mongoose
 * User pre-save hook so controllers can call them explicitly with Prisma.
 */
import bcrypt from 'bcryptjs';

export const hashPassword = async (plain) => bcrypt.hash(plain, 12);

export const comparePassword = (candidatePlain, passwordHash) =>
  bcrypt.compare(candidatePlain, passwordHash);
