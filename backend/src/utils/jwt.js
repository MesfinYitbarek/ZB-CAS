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
 * Cookie options for the refresh token.
 *
 * SameSite 'lax'  (was 'strict'):
 *   SameSite=Strict causes the browser to STRIP the cookie on any top-level
 *   navigation — including a hard page refresh (F5 / Cmd+R). The very first
 *   POST /auth/refresh that AuthContext fires on mount therefore arrives with
 *   no cookie → 400 → catch clears the session → user is logged out.
 *   'lax' still blocks the cookie on cross-site POST (CSRF protection), but
 *   allows it on same-site navigations and reloads, which is correct here.
 *
 * path '/'  (was '/api/auth'):
 *   Scoping to '/api/auth' is a good idea in theory, but some browsers do not
 *   send path-restricted cookies on the very first request after a hard reload
 *   before the page has fully initialised. Using '/' ensures the cookie is
 *   reliably sent on the bootstrap POST /auth/refresh call from AuthContext.
 *   The httpOnly + SameSite=Lax flags still protect it adequately.
 */
export const refreshCookieOptions = () => ({
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax',    // FIX: was 'strict' — strips cookie on page reload
  maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days in ms
  path:     '/',      // FIX: was '/api/auth' — unreliable on first bootstrap request
});