import React, { useState } from 'react';
import { BrisaBaseLogo } from '../components/common/BrisaBaseLogo';

export const UserPasswordResetPage: React.FC = () => {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!token) {
      setError('This password reset link is invalid or incomplete. Request a new link from the application.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || 'Password reset failed.');
      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Password reset failed.');
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
          <h1 className="text-2xl font-semibold text-white mb-1">Choose a new password</h1>
          <p className="text-sm text-slate-400 mb-6">
            This secure link can be used once. After the password changes, previous sessions are closed automatically.
          </p>

          {error && (
            <div role="alert" className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {success ? (
            <div role="status" className="rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-4 text-sm text-green-300">
              Password updated successfully. Return to the application and sign in with your new password.
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="user-reset-password" className="block text-sm font-medium text-slate-300 mb-1">New password</label>
                <input
                  id="user-reset-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter a new password"
                />
              </div>
              <div>
                <label htmlFor="user-reset-password-confirm" className="block text-sm font-medium text-slate-300 mb-1">Confirm new password</label>
                <input
                  id="user-reset-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Repeat the new password"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !token}
                className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-white transition-colors"
              >
                {loading ? 'Updating password...' : 'Update password'}
              </button>
            </form>
          )}

          {!token && !success && (
            <p className="mt-5 text-xs text-slate-500 text-center">Request a new recovery email from the application that created your account.</p>
          )}
        </div>
      </div>
    </div>
  );
};
