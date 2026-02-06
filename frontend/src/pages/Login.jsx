import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import logo from '../image/ZB-logo.png'
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const { login } = useAuth();
  const { show } = useToast();
  const nav = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return show('Enter email and password.', 'error');
    setLoading(true);
    try {
      await login(email, password);
      nav('/dashboard');
    } catch (err) {
      show(err.response?.data?.message || 'Login failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return show('Enter your email.', 'error');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: forgotEmail });
      show('If this email exists, a reset link has been sent.', 'success');
      setShowForgot(false);
    } catch (err) {
      show(err.response?.data?.message || 'Something went wrong.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left panel – brand */}
      <div className="hidden lg:flex lg:flex-[0_0_42%] bg-brand-gradient flex-col justify-between p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-32 -right-32 w-[340px] h-[340px] rounded-full border border-white/10" />
        <div className="absolute -bottom-20 -left-16 w-60 h-60 rounded-full border border-white/8" />

        {/* Logo */}
        <div className="flex items-center gap-3.5 z-10">
          <img
            src={logo}
            alt="Zemen Bank Logo"
            className="h-14 w-auto object-contain"
          />
          <div>
            <div className="text-white font-display text-xl font-bold">Zemen Bank</div>
            <div className="text-white/50 text-[11px] uppercase tracking-widest">
              CAS Platform
            </div>
          </div>
        </div>

        {/* Mid text */}
        <div className="text-white/90 z-10">
          <h1 className="font-display text-[34px] font-bold leading-tight mb-4">
            Measure.<br />
            Develop.<br />
            Excel.
          </h1>
          <p className="text-[15px] text-white/55 leading-relaxed max-w-md">
            The integrated competency assessment platform powering talent development across Zemen Bank.
          </p>
        </div>

        {/* Bottom tag */}
        <div className="text-white/30 text-xs z-10">© 2024 Zemen Bank. All rights reserved.</div>
      </div>

      {/* Right panel – form */}
      <div className="flex-1 flex items-center justify-center p-10 lg:p-16">
        <div className="w-full max-w-[380px]">
          {!showForgot ? (
            <>
              <h2 className="font-display text-[28px] font-bold mb-2">Welcome back</h2>
              <p className="text-gray-500 text-sm mb-8">Sign in to your CAS account</p>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@zemenbank.com"
                    className="w-full h-11 px-3.5 rounded-lg border border-gray-300 focus-brand"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-11 px-3.5 rounded-lg border border-gray-300 focus-brand"
                  />
                </div>
                <div className="flex justify-end -mt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-brand-red text-sm font-semibold hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="font-display text-[28px] font-bold mb-2">Reset Password</h2>
              <p className="text-gray-500 text-sm mb-8">Enter your email to receive a reset link.</p>

              <form onSubmit={handleForgot} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@zemenbank.com"
                    className="w-full h-11 px-3.5 rounded-lg border border-gray-300 focus-brand"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
                  className="block mx-auto mt-5 text-brand-red text-sm font-semibold hover:underline"
                >
                  ← Back to Sign In
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
