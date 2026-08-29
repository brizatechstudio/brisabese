import React, { useState } from 'react';
import { WebhookItem } from '../../types';
import { X, Send, CheckCircle2, Clock } from 'lucide-react';

interface WebhookTesterModalProps {
  webhook: WebhookItem | null;
  onClose: () => void;
  onTest: (webhookId: string) => Promise<{ success: boolean; statusCode: number; responseTimeMs: number; message: string }>;
}

export const WebhookTesterModal: React.FC<WebhookTesterModalProps> = ({
  webhook,
  onClose,
  onTest
}) => {
  const [testResult, setTestResult] = useState<{ success: boolean; statusCode: number; responseTimeMs: number; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  if (!webhook) return null;

  const handleRunTest = async () => {
    setIsTesting(true);
    try {
      const res = await onTest(webhook.id);
      setTestResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-semibold text-slate-100">Testar Webhook: {webhook.name}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 font-mono space-y-1">
            <span className="text-[10px] text-slate-500 font-semibold uppercase">Target Endpoint URL</span>
            <p className="text-purple-300 break-all">{webhook.targetUrl}</p>
          </div>

          <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 font-mono space-y-1">
            <span className="text-[10px] text-slate-500 font-semibold uppercase">Payload de Teste Disparado (JSON)</span>
            <pre className="text-slate-300 text-[11px]">
{`{
  "event": "test.ping",
  "webhook_id": "${webhook.id}",
  "timestamp": "${new Date().toISOString()}",
  "data": {
    "message": "BrisaBase Ping Event",
    "status": "active"
  }
}`}
            </pre>
          </div>

          {testResult && (
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Status {testResult.statusCode} OK
                </span>
                <span className="text-[11px] font-mono text-emerald-300 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {testResult.responseTimeMs}ms
                </span>
              </div>
              <p className="text-[11px] font-mono text-emerald-200/80 mt-1">{testResult.message}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handleRunTest}
            disabled={isTesting}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 shadow-md shadow-purple-900/30"
          >
            {isTesting ? 'Disparando...' : 'Disparar Teste'}
          </button>
        </div>
      </div>
    </div>
  );
};
