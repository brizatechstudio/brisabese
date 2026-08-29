import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrisaLogo } from '../../components/BrisaLogo';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useApp } from '../../context/AppContext';
import { adminAuthService, isRealMode } from '../../services/runtime';

export const ResetPassword: React.FC = () => {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get('token') || '', [params]);
  const navigate = useNavigate();
  const { showToast, language } = useApp();
  const isEnglish = language === 'en-US';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return showToast(isEnglish ? 'Missing token' : 'Token ausente', isEnglish ? 'Open the complete link sent by BrisaBase.' : 'Abra o link completo enviado pelo BrisaBase.', 'error');
    if (password !== confirm) return showToast(isEnglish ? 'Passwords do not match' : 'Senhas diferentes', isEnglish ? 'Confirm the new password.' : 'Confirme a nova senha.', 'error');
    setLoading(true);
    try {
      if (isRealMode) await adminAuthService.confirmPasswordReset(token, password);
      else await new Promise((resolve) => setTimeout(resolve, 300));
      showToast(isEnglish ? 'Password reset' : 'Senha redefinida', isEnglish ? 'You can now sign in with the new password.' : 'Você já pode entrar com a nova senha.', 'success');
      navigate('/login');
    } catch (error) {
      showToast(isEnglish ? 'Reset failed' : 'Falha ao redefinir', error instanceof Error ? error.message : (isEnglish ? 'Invalid or expired token.' : 'Token inválido ou expirado.'), 'error');
    } finally { setLoading(false); }
  };

  return <div className="min-h-screen bg-[#020617] grid place-items-center p-4"><div className="w-full max-w-md p-8 rounded-3xl bg-[#07111F] border border-white/10 space-y-6"><div className="flex justify-center"><BrisaLogo size="lg"/></div><div className="text-center"><h1 className="text-xl font-bold text-white">{isEnglish ? 'Set a new password' : 'Definir nova senha'}</h1><p className="mt-2 text-xs text-slate-400">{isEnglish ? 'BrisaBase ' : 'Fluxo de recuperação '}{isRealMode ? 'real' : 'mock'}{isEnglish ? ' password recovery flow.' : ' do BrisaBase.'}</p></div><form onSubmit={submit} className="space-y-4"><Input label={isEnglish ? 'New password' : 'Nova senha'} type="password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={isRealMode?12:8} required/><Input label={isEnglish ? 'Confirm new password' : 'Confirmar nova senha'} type="password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} minLength={isRealMode?12:8} required/><Button type="submit" variant="gradient" className="w-full" isLoading={loading}>{isEnglish ? 'Save new password' : 'Salvar nova senha'}</Button></form><div className="text-center"><Link to="/login" className="text-xs text-cyan-400">{isEnglish ? 'Back to login' : 'Voltar ao login'}</Link></div></div></div>;
};
