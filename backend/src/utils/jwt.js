/* utils/jwt.js
 * Sign access & refresh tokens, verify them, and build the token-pair response.
 * OWASP: access tokens are short-lived; refresh tokens are long-lived but
 *         should be stored in httpOnly cookies on the client side.
 */
import jwt from 'jsonwebtoken';

const ACCESS_SECRET  = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXP     = process.env.JWT_EXPIRES_IN        || '7d';
const REFRESH_EXP    = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

/**
 * Sign an access token.
 * Payload contains only what the middleware needs – no PII beyond role/id.
 */
export const signAccessToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, ACCESS_SECRET, { expiresIn: ACCESS_EXP });
};

/**
 * Sign a refresh token (longer expiry, separate secret).
 */
export const signRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, REFRESH_SECRET, { expiresIn: REFRESH_EXP });
};

/**
 * Verify an access token.  Throws on failure.
 */
export const verifyAccessToken = (token) => {
  return jwt.verify(token, ACCESS_SECRET);
};

/**
 * Verify a refresh token.  Throws on failure.
 */
export const verifyRefreshToken = (token) => {
  return jwt.verify(token, REFRESH_SECRET);
};

/**
 * Build the standard token-pair response object.
 */
export const buildTokenPair = (userId, role) => ({
  accessToken:  signAccessToken(userId, role),
  refreshToken: signRefreshToken(userId),
});
