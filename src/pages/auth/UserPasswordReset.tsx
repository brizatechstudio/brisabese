import React, { useMemo, useState } from 'react';
import { BrisaLogo } from '../../components/BrisaLogo';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useApp } from '../../context/AppContext';

export const UserPasswordReset: React.FC = () => {
  const { language } = useApp();
  const isEnglish = language === 'en-US';
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', []);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!token) return setError(isEnglish ? 'Invalid or incomplete reset link.' : 'Link de redefinição inválido ou incompleto.');
    if (password !== confirm) return setError(isEnglish ? 'Passwords do not match.' : 'As senhas não coincidem.');
    if (password.length < 8) return setError(isEnglish ? 'Password must be at least 8 characters.' : 'A senha precisa ter pelo menos 8 caracteres.');
    setLoading(true);
    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || (isEnglish ? 'Failed to reset the password.' : 'Falha ao redefinir a senha.'));
      setSuccess(true); setPassword(''); setConfirm('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isEnglish ? 'Failed to reset the password.' : 'Falha ao redefinir a senha.'));
    } finally { setLoading(false); }
  };

  return <div className="min-h-screen bg-[#020617] grid place-items-center p-4 text-white">
    <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#07111F] p-8 shadow-2xl">
      <div className="mb-6 flex justify-center"><BrisaLogo size="lg" /></div>
      <h1 className="text-center text-xl font-bold">{isEnglish ? 'Set a new password' : 'Definir nova senha'}</h1>
      <p className="mt-2 text-center text-xs text-slate-400">{isEnglish ? 'Real password recovery for users of BrisaBase projects.' : 'Recuperação real de senha para usuários dos projetos BrisaBase.'}</p>
      {!token && <div role="alert" className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{isEnglish ? 'Request a new recovery email from the application that created your account.' : 'Solicite um novo e-mail de recuperação no aplicativo que criou sua conta.'}</div>}
      {error && <div role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      {success ? <div role="status" className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">{isEnglish ? 'Password updated. Return to the application and sign in with the new password.' : 'Senha atualizada. Volte ao aplicativo e entre com a nova senha.'}</div> :
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Input label={isEnglish ? 'New password' : 'Nova senha'} type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
          <Input label={isEnglish ? 'Confirm new password' : 'Confirmar nova senha'} type="password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} required />
          <Button type="submit" variant="gradient" className="w-full" isLoading={loading} disabled={!token}>{isEnglish ? 'Update password' : 'Atualizar senha'}</Button>
        </form>}
    </div>
  </div>;
};
