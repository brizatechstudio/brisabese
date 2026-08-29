import { ServerlessFunction } from '../types';

export const INITIAL_FUNCTIONS: ServerlessFunction[] = [
  {
    id: 'fn_send_email',
    name: 'send-email',
    slug: 'send-email',
    runtime: 'nodejs20',
    status: 'active',
    invocationsTotal: 12482,
    successRate: 99.4,
    avgDurationMs: 182,
    lastExecutedAt: '2026-08-04 10:04:12',
    version: 'v1.4.2',
    envVars: { RESEND_API_KEY: 'configured', SENDER_EMAIL: 'configured' },
    codeSnippet: `import { serve } from "@brisabase/functions";

serve(async (req) => {
  const { to, subject, html } = await req.json();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: \`Bearer \${process.env.RESEND_API_KEY}\` },
    body: JSON.stringify({ from: process.env.SENDER_EMAIL, to, subject, html })
  });
  return new Response(JSON.stringify({ ok: true, status: res.status }), { status: 200 });
});`
  },
  {
    id: 'fn_create_order',
    name: 'create-order',
    slug: 'create-order',
    runtime: 'nodejs20',
    status: 'active',
    invocationsTotal: 38910,
    successRate: 99.8,
    avgDurationMs: 245,
    lastExecutedAt: '2026-08-04 09:58:30',
    version: 'v2.1.0',
    envVars: { STRIPE_SECRET_KEY: 'configured', DISCOUNT_PERCENT: '10' },
    codeSnippet: `import { createClient } from "@brisabase/js";

export default async function handler(req, res) {
  const brisabase = createClient({ url: process.env.BRISABASE_URL, key: process.env.BRISABASE_SERVICE_KEY });
  const { userId, items, total } = req.body;

  const { data, error } = await brisabase.from('orders').insert({ user_id: userId, total_amount: total, status: 'pending' });
  if (error) return res.status(500).json({ error: error.message });

  return res.status(201).json({ order: data[0] });
}`
  },
  {
    id: 'fn_generate_pdf',
    name: 'generate-pdf',
    slug: 'generate-pdf',
    runtime: 'python311',
    status: 'active',
    invocationsTotal: 4120,
    successRate: 98.2,
    avgDurationMs: 1250,
    lastExecutedAt: '2026-08-04 08:30:10',
    version: 'v1.0.5',
    envVars: { PDF_ENGINE: 'reportlab', STORAGE_BUCKET: 'documents' },
    codeSnippet: `def main(req):
    data = req.get_json()
    invoice_id = data.get("invoice_id")
    # Generates PDF report and uploads to BrisaBase Storage
    return {"status": "success", "invoice_url": f"https://cdn.brisabase.dev/documents/{invoice_id}.pdf"}`
  },
  {
    id: 'fn_process_payment',
    name: 'process-payment',
    slug: 'process-payment',
    runtime: 'nodejs20',
    status: 'active',
    invocationsTotal: 38200,
    successRate: 99.9,
    avgDurationMs: 310,
    lastExecutedAt: '2026-08-04 10:02:11',
    version: 'v3.0.1',
    envVars: { PAYMENT_GATEWAY: 'stripe', WEBHOOK_SECRET: 'configured' },
    codeSnippet: `export default async function(context) {
  const payload = context.req.body;
  // Verify Stripe webhook signature and update BrisaBase payments table
  return { status: 200, body: { received: true } };
}`
  },
  {
    id: 'fn_webhook_handler',
    name: 'webhook-handler',
    slug: 'webhook-handler',
    runtime: 'go121',
    status: 'active',
    invocationsTotal: 98400,
    successRate: 100.0,
    avgDurationMs: 45,
    lastExecutedAt: '2026-08-04 10:05:00',
    version: 'v1.2.0',
    envVars: { LOG_LEVEL: 'info' },
    codeSnippet: `package main

import (
	"encoding/json"
	"net/http"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}`
  },
  {
    id: 'fn_cleanup_users',
    name: 'cleanup-users',
    slug: 'cleanup-users',
    runtime: 'nodejs20',
    status: 'active',
    invocationsTotal: 30,
    successRate: 100.0,
    avgDurationMs: 3400,
    lastExecutedAt: '2026-08-04 03:00:00',
    version: 'v1.0.0',
    envVars: { INACTIVE_DAYS_THRESHOLD: '90' },
    codeSnippet: `// Cron trigger: Executed every night at 03:00 UTC
export default async function cron() {
  console.log("Cleaning up expired user sessions and temporary upload files...");
  return { cleaned: 142 };
}`
  }
];
