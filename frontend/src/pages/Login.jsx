import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

import logoFull from '../image/ZB-logo.png';
import bullArt  from '../image/bull.jpg';
import zIcon    from '../image/z.jpg';

// Map backend error messages → friendly user-facing messages
function friendlyError(err) {
  const status  = err.response?.status;
  const message = err.response?.data?.message || '';

  if (!err.response) return 'Unable to reach the server. Check your connection.';

  if (status === 423) {
    // Account lockout — backend message already says "Try again in X minute(s)"
    return message;
  }

  if (
    status === 401 ||
    message.toLowerCase().includes('invalid username') ||
    message.toLowerCase().includes('invalid password') ||
    message.toLowerCase().includes('invalid email or password')
  ) {
    return 'The username or password you entered is incorrect. Please try again.';
  }

  if (status === 403) {
    return 'Your account is inactive. Please contact HR.';
  }

  if (status === 400) {
    return 'Please fill in both username and password.';
  }

  return 'Something went wrong. Please try again.';
}

export default function Login() {
  const [username,   setUsername]   = useState('');
  const [password,   setPassword]   = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loading,    setLoading]    = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');

    if (!username.trim() || !password) {
      setLoginError('Please enter your username and password.');
      return;
    }

    setLoading(true);
    try {
      await login(username.trim(), password);
      nav('/dashboard');
    } catch (err) {
      setLoginError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:flex-[0_0_42%] bg-[#1a1a1a] flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-40">
          <img src={bullArt} alt="" loading="lazy" className="w-full h-full object-cover mix-blend-luminosity" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-transparent to-[#1a1a1a]/80" />
        </div>

        <div className="flex items-center gap-3.5 z-10">
          <img src={zIcon} alt="Zemen Icon" loading="lazy" className="h-14 w-auto object-contain" />
          <div className="text-white  text-xl font-bold">Competency Assessment System</div>
        </div>

        <div className="text-white z-10">
          <h1 className=" text-[48px] font-black leading-[1.1] mb-6 tracking-tighter">
            Measure.<br />Develop.<br />
            <span className="text-red-600">Excel.</span>
          </h1>
          <div className="w-16 h-1 bg-red-600 mb-6" />
        </div>

        <div className="text-white/30 text-xs z-10">© 2026 Zemen Bank. All rights reserved.</div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-10 lg:p-16">
        <div className="w-full max-w-[380px]">

          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-12">
            <img src={logoFull} alt="Zemen Bank" className="h-16 w-auto object-contain" />
          </div>

          <h2 className=" text-[28px] font-bold mb-8 lg:text-left text-center">Welcome back</h2>

          <form onSubmit={handleLogin} className="space-y-5" noValidate>

            {/* Username */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setLoginError(''); }}
                placeholder="your.username"
                autoComplete="username"
                className={`w-full h-11 px-3.5 rounded-lg border outline-none transition-colors ${
                  loginError ? 'border-red-400 bg-red-50 focus:border-red-500' : 'border-gray-300 focus-brand'
                }`}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setLoginError(''); }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`w-full h-11 pl-3.5 pr-11 rounded-lg border outline-none transition-colors ${
                    loginError ? 'border-red-400 bg-red-50 focus:border-red-500' : 'border-gray-300 focus-brand'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:text-gray-600 outline-none"
                >
                  {showPassword
                    ? <EyeOff className="w-4 h-4" aria-hidden="true" />
                    : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign In'}
            </button>

            {/* ── Inline error message ────────────────────────────────── */}
            {loginError && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200">
                <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.25a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zm.75 7.5a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd"/>
                </svg>
                <p className="text-sm text-red-700 leading-snug">{loginError}</p>
              </div>
            )}

          </form>
        </div>
      </div>
    </div>
  );
}
