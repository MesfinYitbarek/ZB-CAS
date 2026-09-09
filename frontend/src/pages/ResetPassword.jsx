import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { Lock, CheckCircle } from 'lucide-react';
import api from '../utils/api';

export default function ResetPassword() {
  const { token } = useParams();
  const nav = useNavigate();
  const { show } = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState(true);

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      show('Invalid reset link.', 'error');
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (password.length < 8) {
      return show('Password must be at least 8 characters.', 'error');
    }
    if (password !== confirmPassword) {
      return show('Passwords do not match.', 'error');
    }

    setLoading(true);
    try {
      await api.post(`/auth/reset-password/${token}`, { password });
      setSuccess(true);
      show('Password reset successful!', 'success');
      setTimeout(() => nav('/login'), 3000);
    } catch (err) {
      show(err.response?.data?.message || 'Reset failed. Link may be expired.', 'error');
      setTokenValid(false);
    } finally {
      setLoading(false);
    }
  };

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-12 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl  font-bold text-brand-black mb-2">Invalid Reset Link</h2>
          <p className="text-gray-500 mb-6">This password reset link is invalid or has expired.</p>
          <button onClick={() => nav('/login')} className="px-6 py-3 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors">
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-12 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl  font-bold text-brand-black mb-2">Password Reset Successful</h2>
          <p className="text-gray-500 mb-6">Your password has been successfully reset. Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:flex-[0_0_42%] bg-brand-gradient flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[340px] h-[340px] rounded-full border border-white/10" />
        <div className="absolute -bottom-20 -left-16 w-60 h-60 rounded-full border border-white/8" />

        <div className="flex items-center gap-3.5 z-10">
          <div className="w-14 h-14 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
            <span className="text-white  font-bold text-[22px]">ZB</span>
          </div>
          <div>
            <div className="text-white  text-xl font-bold">Zemen Bank</div>
            <div className="text-white/50 text-[11px] uppercase tracking-widest">CAS Platform</div>
          </div>
        </div>

        <div className="text-white/90 z-10">
          <h1 className=" text-[34px] font-bold leading-tight mb-4">Secure.<br />Reset.<br />Continue.</h1>
        </div>

        <div className="text-white/30 text-xs z-10">© 2024 Zemen Bank. All rights reserved.</div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-10 lg:p-16">
        <div className="w-full max-w-[380px]">
          <div className="mb-8">
            <div className="w-12 h-12 rounded-xl bg-brand-red/10 flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-brand-red" />
            </div>
            <h2 className=" text-[28px] font-bold mb-8">Reset Password</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-11 px-3.5 rounded-lg border border-gray-300 focus-brand"
                required
              />
              <p className="text-xs text-gray-500 mt-1.5">Minimum 8 characters</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-11 px-3.5 rounded-lg border border-gray-300 focus-brand"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-brand-red text-white rounded-lg font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>

            <div className="text-center">
              <button type="button" onClick={() => nav('/login')} className="text-brand-red text-sm font-semibold hover:underline">
                ← Back to Login
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
