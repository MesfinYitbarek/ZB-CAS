/* utils/jwt.js
 * SECURITY FIX (A02, A07):
 *  - Access token lifetime reduced from 7d → 15m
 *  - Refresh token lifetime kept at 30d but now rotated on every use AND on role switch
 *  - Tokens stored in httpOnly cookies on the response (see authController)
 */
import jwt from 'jsonwebtoken';

const ACCESS_SECRET  = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXP     = process.env.JWT_EXPIRES_IN         || '15m';   // FIX: was '7d'
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
export const verifyAccessToken  = (token) => jwt.verify(token, ACCESS_SECRET);

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

/**
 * Cookie options for the refresh token (httpOnly, Secure, SameSite=Strict).
 * SECURITY FIX (A02): Refresh token must be sent as httpOnly cookie – not in body.
 */
export const refreshCookieOptions = () => ({
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days in ms
  path:     '/api/auth',               // scope cookie to auth routes only
});
