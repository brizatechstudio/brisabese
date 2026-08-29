import React, { useState } from 'react';
import { useNavigate, Link } from '../routing';
import { adminAuthService } from '../services/adminAuthService';
import { BrisaBaseLogo } from '../components/common/BrisaBaseLogo';

export const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await adminAuthService.login(email, password, totpCode || undefined);
      if ('mfa_required' in result) {
        setMfaRequired(true);
        return;
      }
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <BrisaBaseLogo size="lg" showText={false} />
        </div>
        <div className="bb-panel rounded-2xl p-8">
          <h1 className="text-2xl font-semibold text-white mb-1">BrisaBase Admin</h1>
          <p className="text-sm text-slate-400 mb-6">Sign in to manage your platform.</p>
          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="••••••••"
              />
            </div>
            {mfaRequired && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">MFA Code</label>
                <input
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  required
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="6-digit code"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-white transition-colors"
            >
              {loading ? 'Signing in...' : mfaRequired ? 'Verify MFA' : 'Sign In'}
            </button>
          </form>
          <div className="mt-6 flex items-center justify-between text-sm">
            <Link to="/signup" className="text-indigo-400 hover:text-indigo-300">Create account</Link>
            <Link to="/forgot-password" className="text-slate-400 hover:text-slate-300">Forgot password?</Link>
          </div>
        </div>
      </div>
    </div>
  );
};