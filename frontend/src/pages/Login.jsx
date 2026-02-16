import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';

// Assets
import logoFull from '../image/ZB-logo.png'; // Original Full Logo
import bullArt from '../image/bull.jpg';
import zIcon from '../image/z.jpg';

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
      {/* Left panel – brand (Beautiful Dark Theme) */}
      <div className="hidden lg:flex lg:flex-[0_0_42%] bg-[#1a1a1a] flex-col justify-between p-12 relative overflow-hidden">
        
        {/* Background Bull Graphic */}
        <div className="absolute inset-0 z-0 opacity-40">
          <img 
            src={bullArt} 
            alt="Background Art" 
            className="w-full h-full object-cover mix-blend-luminosity"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-transparent to-[#1a1a1a]/80" />
        </div>

        {/* Desktop Logo - Z-Icon integrated natively */}
        <div className="flex items-center gap-3.5 z-10">
          <img
            src={zIcon}
            alt="Zemen Icon"
            className="h-14 w-auto object-contain"
          />
          <div>
            <div className="text-white font-display text-xl font-bold">CAS Platform</div>
          </div>
        </div>

        {/* Mid text */}
        <div className="text-white z-10">
          <h1 className="font-display text-[48px] font-black leading-[1.1] mb-6 tracking-tighter">
            Measure.<br />
            Develop.<br />
            <span className="text-red-600">Excel.</span>
          </h1>
          <div className="w-16 h-1 bg-red-600 mb-6"></div>
          <p className="text-[17px] text-gray-400 leading-relaxed max-w-md font-light">
            The integrated competency assessment platform powering talent development across Zemen Bank.
          </p>
        </div>

        {/* Bottom tag */}
        <div className="text-white/30 text-xs z-10">© 2026 Zemen Bank. All rights reserved.</div>
      </div>

      {/* Right panel – Form */}
      <div className="flex-1 flex items-center justify-center p-10 lg:p-16">
        <div className="w-full max-w-[380px]">
          
          {/* Mobile Logo: Displaying original logo without text below */}
          <div className="lg:hidden flex justify-center mb-12">
            <img
              src={logoFull}
              alt="Zemen Bank"
              className="h-16 w-auto object-contain"
            />
          </div>

          {!showForgot ? (
            <>
              <h2 className="font-display text-[28px] font-bold mb-2 lg:text-left text-center">Welcome back</h2>
              <p className="text-gray-500 text-sm mb-8 lg:text-left text-center">Sign in to your CAS account</p>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@zemenbank.com"
                    className="w-full h-11 px-3.5 rounded-lg border border-gray-300 focus-brand outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-11 px-3.5 rounded-lg border border-gray-300 focus-brand outline-none"
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
              <h2 className="font-display text-[28px] font-bold mb-2 lg:text-left text-center">Reset Password</h2>
              <p className="text-gray-500 text-sm mb-8 lg:text-left text-center">Enter your email to receive a reset link.</p>

              <form onSubmit={handleForgot} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@zemenbank.com"
                    className="w-full h-11 px-3.5 rounded-lg border border-gray-300 focus-brand outline-none"
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