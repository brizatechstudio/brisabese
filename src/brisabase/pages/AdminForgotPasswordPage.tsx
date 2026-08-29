import React, { useState } from 'react';
import { Link } from '../routing';
import { adminAuthService } from '../services/adminAuthService';
import { BrisaBaseLogo } from '../components/common/BrisaBaseLogo';

export const AdminForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await adminAuthService.requestPasswordReset(email);
      setSuccess('If the account exists, reset instructions were sent.');
    } catch (err: any) {
      setError(err.message || 'Password reset request failed.');
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
          <h1 className="text-2xl font-semibold text-white mb-1">Forgot Password</h1>
          <p className="text-sm text-slate-400 mb-6">Enter your email to receive reset instructions.</p>
          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-3 text-sm text-green-400">
              {success}
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
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-white transition-colors"
            >
              {loading ? 'Sending...' : 'Send Reset Instructions'}
            </button>
          </form>
          <div className="mt-6 text-center text-sm">
            <Link to="/login" className="text-indigo-400 hover:text-indigo-300">Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
};