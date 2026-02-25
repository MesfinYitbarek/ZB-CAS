/* utils/jwt.js
 * Sign access & refresh tokens, verify them, and build the token-pair response.
 *
 * Change: access token now carries `activeRole` (the role the user is currently
 * operating under) in addition to `id`.  This lets the auth middleware enforce
 * per-request role checks without a DB hit, even for multi-role users.
 */
import jwt from 'jsonwebtoken';

const ACCESS_SECRET  = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXP     = process.env.JWT_EXPIRES_IN         || '7d';
const REFRESH_EXP    = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

/**
 * Sign an access token.
 * @param {string} userId
 * @param {string} activeRole – the role the user is currently acting as
 */
export const signAccessToken = (userId, activeRole) => {
  return jwt.sign({ id: userId, role: activeRole }, ACCESS_SECRET, {
    expiresIn: ACCESS_EXP,
  });
};

/**
 * Sign a refresh token (longer expiry, separate secret).
 */
export const signRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, REFRESH_SECRET, { expiresIn: REFRESH_EXP });
};

/** Verify an access token.  Throws on failure. */
export const verifyAccessToken = (token) => jwt.verify(token, ACCESS_SECRET);

/** Verify a refresh token.  Throws on failure. */
export const verifyRefreshToken = (token) => jwt.verify(token, REFRESH_SECRET);

/**
 * Build the standard token-pair response object.
 * @param {string} userId
 * @param {string} activeRole – the role being activated
 */
export const buildTokenPair = (userId, activeRole) => ({
  accessToken:  signAccessToken(userId, activeRole),
  refreshToken: signRefreshToken(userId),
});
