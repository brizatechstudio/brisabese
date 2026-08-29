import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrisaLogo } from '../../components/BrisaLogo';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useApp } from '../../context/AppContext';
import { adminAuthService, isRealMode } from '../../services/runtime';
import { ArrowRight, Check, KeyRound } from 'lucide-react';

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const { showToast, refreshSession, language } = useApp();
  const isEnglish = language === 'en-US';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      showToast(isEnglish ? 'Passwords do not match' : 'Senhas diferentes', isEnglish ? 'Enter the same password in both fields.' : 'Confirme a mesma senha para continuar.', 'error');
      return;
    }
    if (!acceptedTerms) {
      showToast(isEnglish ? 'Accept the terms' : 'Aceite os termos', isEnglish ? 'Accept the terms to complete registration.' : 'Marque o aceite para concluir o cadastro.', 'warning');
      return;
    }
    setIsLoading(true);
    try {
      if (isRealMode) {
        await adminAuthService.signup({ email, password, name, bootstrapToken: bootstrapToken.trim() || undefined });
        const result = await adminAuthService.login(email, password);
        if ('mfa_required' in result) {
          showToast(isEnglish ? 'Account created' : 'Conta criada', isEnglish ? 'Sign in and complete MFA to access the console.' : 'Faça login e conclua o MFA para acessar.', 'success');
          navigate('/login');
          return;
        }
        await refreshSession();
        showToast(isEnglish ? 'Account created!' : 'Conta criada!', isEnglish ? 'Administrative account created in the local PostgreSQL control plane.' : 'Conta administrativa criada no PostgreSQL local.', 'success');
        navigate('/');
      } else {
        localStorage.setItem('brisabase_mock_session', JSON.stringify({ name, email, provider: 'email', createdAt: new Date().toISOString() }));
        await refreshSession();
        showToast(isEnglish ? 'Account created!' : 'Conta criada!', isEnglish ? 'Simulated registration completed.' : 'Cadastro simulado concluído.', 'success');
        navigate('/');
      }
    } catch (error) {
      showToast(isEnglish ? 'Could not create account' : 'Falha ao criar conta', error instanceof Error ? error.message : (isEnglish ? 'Registration could not be completed.' : 'Não foi possível concluir o cadastro.'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="w-full max-w-md p-8 rounded-3xl bg-[#07111F]/90 border border-white/[0.08] shadow-2xl backdrop-blur-xl space-y-6 relative z-10">
        <div className="text-center space-y-2"><div className="flex justify-center"><BrisaLogo size="lg" /></div><p className="text-xs text-slate-400">{isRealMode ? (isEnglish ? 'Create an administrative account in the local runtime' : 'Crie uma conta administrativa no runtime local') : (isEnglish ? 'Create an account in mock mode' : 'Crie uma conta no modo mock')}</p></div>
        <form onSubmit={handleRegister} className="space-y-4">
          <Input label={isEnglish ? 'Full Name' : 'Nome Completo'} placeholder="Mariana Souza" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <Input label="E-mail" type="email" placeholder="mariana@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label={isEnglish ? 'Strong Password' : 'Senha Forte'} type="password" placeholder={isRealMode ? (isEnglish ? 'Minimum 12 characters' : 'Mínimo 12 caracteres') : (isEnglish ? 'Minimum 8 characters' : 'Mínimo 8 caracteres')} value={password} onChange={(e) => setPassword(e.target.value)} minLength={isRealMode ? 12 : 8} required />
          <Input label={isEnglish ? 'Confirm Password' : 'Confirmar Senha'} type="password" placeholder={isEnglish ? 'Repeat your password' : 'Repita sua senha'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={isRealMode ? 12 : 8} required />
          {isRealMode && <div className="rounded-xl border border-cyan-400/15 bg-cyan-500/[0.04] p-3"><Input label={isEnglish ? 'Bootstrap token (first local account only)' : 'Token de inicialização (somente primeira conta local)'} type="password" placeholder="ADMIN_BOOTSTRAP_TOKEN" value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} leftIcon={<KeyRound className="w-4 h-4" />} /><p className="mt-2 text-[10px] leading-4 text-slate-500">{isEnglish ? 'It is not stored by the frontend. It is only sent in the first owner creation request. Leave it empty after the first account.' : 'Não é salvo pelo frontend. Ele só é enviado no header da criação do primeiro owner. Depois da primeira conta, deixe vazio.'}</p></div>}
          <label className="flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-[#0B1628]/50 p-3 text-xs text-slate-400 cursor-pointer"><input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-0.5 accent-cyan-400" /><span>{isEnglish ? 'I accept the BrisaBase Terms of Use and Privacy Policy.' : 'Aceito os Termos de Uso e a Política de Privacidade do BrisaBase.'}</span></label>
          <div className="space-y-1.5 text-xs text-slate-400"><div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400" /><span>{isRealMode ? (isEnglish ? 'Real JWT sessions and refresh tokens' : 'Sessões JWT e refresh token reais') : (isEnglish ? 'Isolated flow for interface testing' : 'Fluxo isolado para testes de interface')}</span></div><div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400" /><span>{isRealMode ? (isEnglish ? 'Local PostgreSQL control plane' : 'PostgreSQL local como control plane') : (isEnglish ? 'No external infrastructure' : 'Sem infraestrutura externa')}</span></div></div>
          <Button type="submit" variant="gradient" size="md" className="w-full" isLoading={isLoading} rightIcon={<ArrowRight className="w-4 h-4" />}>{isEnglish ? 'Create Account' : 'Criar Conta'}</Button>
        </form>
        <div className="text-center text-xs text-slate-400">{isEnglish ? 'Already have an account? ' : 'Já possui conta? '}<Link to="/login" className="text-cyan-400 hover:underline font-bold">{isEnglish ? 'Sign in' : 'Fazer login'}</Link></div>
      </div>
    </div>
  );
};
