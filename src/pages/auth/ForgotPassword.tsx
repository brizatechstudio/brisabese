import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BrisaLogo } from '../../components/BrisaLogo';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useApp } from '../../context/AppContext';
import { adminAuthService, isRealMode } from '../../services/runtime';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

export const ForgotPassword: React.FC = () => {
  const { showToast, language } = useApp();
  const isEnglish = language === 'en-US';
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isRealMode) await adminAuthService.requestPasswordReset(email);
      else await new Promise((resolve) => setTimeout(resolve, 350));
      setIsSubmitted(true);
      showToast(isEnglish ? 'Request sent!' : 'Solicitação enviada!', isRealMode ? (isEnglish ? 'The real runtime processed the password recovery request.' : 'O runtime real processou a recuperação de senha.') : (isEnglish ? 'Simulated recovery completed.' : 'Recuperação simulada concluída.'), 'success');
    } catch (error) {
      showToast(isEnglish ? 'Recovery failed' : 'Falha na recuperação', error instanceof Error ? error.message : (isEnglish ? 'Try again.' : 'Tente novamente.'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden"><div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"/><div className="w-full max-w-md p-8 rounded-3xl bg-[#07111F]/90 border border-white/[0.08] shadow-2xl backdrop-blur-xl space-y-6 relative z-10"><div className="text-center space-y-2"><div className="flex justify-center"><BrisaLogo size="lg" /></div><p className="text-xs text-slate-400">{isEnglish ? 'Recover access to your administrative account' : 'Recupere o acesso à sua conta administrativa'}</p></div>{isSubmitted?<div className="p-6 rounded-2xl bg-[#0B1628] border border-white/[0.06] text-center space-y-4"><CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto"/><h3 className="text-sm font-bold text-slate-100">{isEnglish ? 'Check your email' : 'Verifique seu E-mail'}</h3><p className="text-xs text-slate-400 leading-relaxed">{isEnglish ? 'If the account exists, the link was processed for ' : 'Se a conta existir, o link foi processado para '}<span className="text-cyan-400 font-mono">{email}</span>.</p><Link to="/login" className="inline-flex items-center justify-center gap-2 text-xs text-cyan-400 hover:underline font-bold pt-2"><ArrowLeft className="w-4 h-4"/><span>{isEnglish ? 'Back to Login' : 'Voltar ao Login'}</span></Link></div>:<form onSubmit={handleSubmit} className="space-y-4"><Input label={isEnglish ? 'Registered email' : 'E-mail Cadastrado'} type="email" placeholder="nome@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus/><Button type="submit" variant="gradient" size="md" className="w-full" isLoading={isLoading}>{isEnglish ? 'Send Reset Link' : 'Enviar Link de Redefinição'}</Button><div className="text-center pt-2"><Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"><ArrowLeft className="w-3.5 h-3.5"/><span>{isEnglish ? 'Back to login' : 'Voltar para o login'}</span></Link></div></form>}</div></div>;
};
