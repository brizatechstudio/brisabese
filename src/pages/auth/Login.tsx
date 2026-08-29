import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrisaLogo } from '../../components/BrisaLogo';
import { useApp } from '../../context/AppContext';
import { adminAuthService, isRealMode } from '../../services/runtime';
import { Mail, Lock, EyeOff, ArrowRight, ShieldCheck, Zap, CloudUpload, KeyRound } from 'lucide-react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { showToast, refreshSession, runtimeMode, language } = useApp();
  const isEnglish = language === 'en-US';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError(null);
    try {
      if (isRealMode) {
        const result = await adminAuthService.login(email, password, mfaRequired ? totpCode : undefined);
        if ('mfa_required' in result && result.mfa_required) {
          setMfaRequired(true);
          showToast(isEnglish ? 'MFA required' : 'MFA necessário', isEnglish ? 'Enter the code from your authenticator to continue.' : 'Digite o código do seu autenticador para continuar.', 'info');
          return;
        }
        await refreshSession();
        showToast(isEnglish ? 'Welcome back!' : 'Bem-vindo de volta!', isEnglish ? 'Real administrative session started.' : 'Sessão administrativa real iniciada.', 'success');
      } else {
        localStorage.setItem('brisabase_mock_session', JSON.stringify({ email, provider: 'email', createdAt: new Date().toISOString() }));
        await refreshSession();
        showToast(isEnglish ? 'Welcome back!' : 'Bem-vindo de volta!', isEnglish ? 'Mock session created successfully.' : 'Sessão mock criada com sucesso.', 'success');
      }
      navigate('/');
    } catch (error) {
      const title = isEnglish ? 'Login failed' : 'Falha no login';
      const description = error instanceof Error ? error.message : (isEnglish ? 'Invalid credentials.' : 'Credenciais inválidas.');
      setLoginError(description);
      showToast(title, description, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    if (isRealMode) {
      showToast(
        isEnglish ? 'Console OAuth is not configured' : 'OAuth do console não configurado',
        isEnglish ? 'OAuth is available for project users. Use email/password for the administrative console.' : 'OAuth está disponível para usuários dos projetos. Para o painel administrativo, use e-mail/senha.',
        'info'
      );
      return;
    }
    setLoading(true);
    localStorage.setItem('brisabase_mock_session', JSON.stringify({ email: 'lucas.moreira@brisabase.dev', provider: 'google', createdAt: new Date().toISOString() }));
    window.setTimeout(async () => {
      await refreshSession();
      setLoading(false);
      showToast(isEnglish ? 'Google OAuth simulated' : 'Google OAuth simulado', isEnglish ? 'Provider connected only in mock mode.' : 'Provider conectado apenas no modo mock.', 'success');
      navigate('/');
    }, 350);
  };

  return <div className="auth-shell min-h-screen relative overflow-hidden bg-[#020713] text-white flex items-center justify-center px-5 py-10">
    <div className="absolute inset-0 auth-bg pointer-events-none"/>
    <div className="relative z-10 w-full max-w-[1180px] grid lg:grid-cols-[1fr_1.02fr] gap-14 xl:gap-24 items-center">
      <section className="hidden lg:flex flex-col items-center text-center px-4">
        <BrisaLogo size="xl" showText />
        <div className="mt-5 text-2xl font-medium tracking-tight">{isEnglish ? <>Your <span className="text-cyan-400">base.</span> Your <span className="text-cyan-400">future.</span></> : <>Sua <span className="text-cyan-400">base.</span> Seu <span className="text-cyan-400">futuro.</span></>}</div>
        <p className="mt-8 max-w-[390px] text-[15px] leading-6 text-slate-300/75">{isEnglish ? 'A complete backend platform for your applications. PostgreSQL, Auth, Storage, Realtime and Functions in a single runtime.' : 'A plataforma completa de backend para seus aplicativos. PostgreSQL, Auth, Storage, Realtime e Functions em um único runtime.'}</p>
        <div className="mt-12 w-full max-w-[430px] grid grid-cols-3 gap-7 text-sm text-slate-300"><div className="grid justify-items-center gap-3"><ShieldCheck className="text-cyan-400"/>{isEnglish ? <>Advanced<br/>Security</> : <>Segurança<br/>Avançada</>}</div><div className="grid justify-items-center gap-3"><Zap className="text-cyan-400"/>{isEnglish ? <>High<br/>Performance</> : <>Alta<br/>Performance</>}</div><div className="grid justify-items-center gap-3"><CloudUpload className="text-cyan-400"/>{isEnglish ? <>Local<br/>Runtime</> : <>Runtime<br/>Local</>}</div></div>
      </section>

      <section className="auth-card mx-auto w-full max-w-[560px] rounded-[24px] border border-[#2498ff] bg-[#071224]/78 backdrop-blur-xl p-7 sm:p-10 xl:p-14 shadow-[0_0_0_1px_rgba(0,174,255,.10),0_30px_90px_rgba(0,75,180,.24)]">
        <div className="lg:hidden flex justify-center mb-8"><BrisaLogo size="lg" /></div>
        <div className="text-center"><h1 className="text-2xl sm:text-3xl font-bold">{isEnglish ? <>Welcome <span className="text-[#288eff]">back</span></> : <>Bem-vindo de <span className="text-[#288eff]">volta</span></>}</h1><p className="mt-3 text-sm text-slate-400">{runtimeMode === 'real' ? (isEnglish ? 'Access the real BrisaBase control plane' : 'Acesse o control plane real do BrisaBase') : (isEnglish ? 'Access the BrisaBase mock' : 'Acesse o mock do BrisaBase')}</p></div>
        <form onSubmit={handleLogin} className="mt-10 space-y-6">
          <label className="block"><span className="block mb-2 text-sm font-semibold">E-mail</span><div className="h-13 rounded-lg border border-[#53627a] bg-[#070f1e]/75 flex items-center px-4 gap-3 focus-within:border-cyan-400"><Mail className="w-4 h-4 text-slate-400"/><input value={email} onChange={e=>setEmail(e.target.value)} type="email" required placeholder="seu@email.com" className="w-full bg-transparent outline-none text-sm placeholder:text-slate-500"/></div></label>
          <label className="block"><span className="block mb-2 text-sm font-semibold">{isEnglish ? 'Password' : 'Senha'}</span><div className="h-13 rounded-lg border border-[#53627a] bg-[#070f1e]/75 flex items-center px-4 gap-3 focus-within:border-cyan-400"><Lock className="w-4 h-4 text-slate-400"/><input value={password} onChange={e=>setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} required minLength={isRealMode ? 12 : 8} placeholder="••••••••••••" className="w-full bg-transparent outline-none text-sm placeholder:text-slate-500"/><button type="button" onClick={() => setShowPassword((v) => !v)} className="text-slate-400 hover:text-cyan-300" aria-label={showPassword ? (isEnglish ? 'Hide password' : 'Ocultar senha') : (isEnglish ? 'Show password' : 'Mostrar senha')}><EyeOff className="w-4 h-4"/></button></div><div className="mt-3 text-right"><Link to="/forgot-password" className="text-xs text-cyan-400">{isEnglish ? 'Forgot your password?' : 'Esqueceu sua senha?'}</Link></div></label>
          {mfaRequired && <label className="block"><span className="block mb-2 text-sm font-semibold">{isEnglish ? 'MFA code' : 'Código MFA'}</span><div className="h-13 rounded-lg border border-cyan-400/50 bg-[#070f1e]/75 flex items-center px-4 gap-3"><KeyRound className="w-4 h-4 text-cyan-400"/><input value={totpCode} onChange={e=>setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" required placeholder="000000" className="w-full bg-transparent outline-none text-sm tracking-[0.35em]"/></div></label>}
          {loginError && <div role="alert" aria-live="assertive" className="rounded-lg border border-red-400/40 bg-red-950/35 px-4 py-3 text-sm text-red-100">{loginError}</div>}
          <button type="submit" disabled={loading} className="w-full h-13 rounded-lg bg-gradient-to-r from-[#176dff] to-[#21c6ef] font-semibold flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(0,139,255,.25)] disabled:opacity-60">{loading ? (isEnglish ? 'Signing in...' : 'Entrando...') : mfaRequired ? (isEnglish ? 'Validate MFA' : 'Validar MFA') : (isEnglish ? 'Sign in' : 'Entrar')} <ArrowRight className="w-4 h-4"/></button>
        </form>
        <div className="my-8 flex items-center gap-5 text-xs text-slate-500"><span className="h-px flex-1 bg-[#334158]"/>{isEnglish ? 'OR' : 'OU'}<span className="h-px flex-1 bg-[#334158]"/></div>
        <button type="button" onClick={handleGoogleLogin} disabled={loading} className="w-full h-13 rounded-lg border border-[#526177] bg-[#07101f]/70 flex items-center justify-center gap-3 text-sm font-semibold hover:border-cyan-400/50 disabled:opacity-50"><span className="text-lg font-black"><span className="text-blue-400">G</span></span>{isRealMode ? (isEnglish ? 'Google (project users via Auth)' : 'Google (projetos via Auth)') : (isEnglish ? 'Sign in with Google' : 'Entrar com Google')}</button>
        <div className="mt-9 text-center text-sm text-slate-400">{isEnglish ? 'Don’t have an account? ' : 'Não tem uma conta? '}<Link to="/register" className="text-cyan-400 font-medium">{isEnglish ? 'Create account' : 'Criar conta'}</Link></div>
      </section>
    </div>
    <div className="absolute bottom-6 left-0 right-0 text-center text-xs text-slate-500">© 2026 BrisaBase. {isEnglish ? 'All rights reserved.' : 'Todos os direitos reservados.'}</div>
  </div>;
};
