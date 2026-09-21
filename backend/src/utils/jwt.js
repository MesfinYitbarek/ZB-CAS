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
 * @param {string} userId
 * @param {string} activeRole – the role the user is currently acting as
 */
export const signRefreshToken = (userId, activeRole) => {
  return jwt.sign({ id: userId, role: activeRole }, REFRESH_SECRET, { expiresIn: REFRESH_EXP });
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
  refreshToken: signRefreshToken(userId, activeRole),
});

/**
 * Cookie options for the refresh token.
 *
 * Development  (NODE_ENV !== 'production'):
 *   Frontend and backend share the same origin via the Vite proxy, so
 *   SameSite=Lax + Secure=false is correct and cookies flow freely.
 *
 * Production on Render (or any cross-origin deployment):
 *   Frontend (https://zb-cas.onrender.com) and backend API
 *   (https://zb-cas-api.onrender.com) are DIFFERENT origins.
 *   Cross-origin cookies require SameSite=None AND Secure=true.
 *   Without this the browser silently drops the cookie on every request,
 *   so POST /auth/refresh arrives with no cookie → 400 → user is logged out.
 *
 *   SameSite=None is still safe here because:
 *     • The token is validated against the DB on every use (rotation check)
 *     • HTTPS is enforced in production (Secure=true)
 *     • httpOnly prevents JS access entirely
 */
export const refreshCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure:   isProd,                     // must be true when SameSite=None
    sameSite: isProd ? 'none' : 'lax',   // 'none' required for cross-origin prod
    maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days in ms
    path:     '/',
  };
};