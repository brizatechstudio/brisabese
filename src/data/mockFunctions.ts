import { ServerlessFunction } from '../types';

export const initialFunctions: ServerlessFunction[] = [
  {
    id: 'fn-notify',
    name: 'sendNotification',
    description: 'Dispara notificações push via Firebase Cloud Messaging e WebSocket',
    status: 'active',
    runtime: 'Node.js 20',
    region: 'São Paulo (sa-east-1)',
    memory: '512 MB',
    timeout: 60,
    executionsCount: '48.2K',
    executionsTotal: 48210,
    avgDuration: '320ms',
    errorRate: '0.4%',
    lastExecuted: 'há 12 segundos',
    environmentVariables: [
      { key: 'FCM_SERVER_KEY', value: 'fcm_sec_***89a' },
      { key: 'APP_ENV', value: 'production' }
    ],
    code: `// BrisaBase Serverless Function: sendNotification
import { BrisaBase } from "@brisabase/js";

export default async function handler(req, res) {
  const { userId, title, body, payload } = req.body;

  if (!userId || !title) {
    return res.status(400).json({ error: "Missing required fields: userId or title" });
  }

  try {
    const brisa = new BrisaBase();

    // Broadcast via Realtime Channel
    await brisa.realtime.channel(\`user:\${userId}\`).emit("notification", {
      title,
      body,
      payload,
      timestamp: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      deliveredAt: new Date().toISOString(),
      recipient: userId
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}`
  },
  {
    id: 'fn-payment',
    name: 'processPayment',
    description: 'Processamento de checkout via webhook bancário com conciliação automática',
    status: 'active',
    runtime: 'Node.js 20',
    region: 'São Paulo (sa-east-1)',
    memory: '1024 MB',
    timeout: 30,
    executionsCount: '32.6K',
    executionsTotal: 32600,
    avgDuration: '540ms',
    errorRate: '0.8%',
    lastExecuted: 'há 2 minutos',
    environmentVariables: [
      { key: 'STRIPE_SECRET_KEY', value: 'sk_live_***92' },
      { key: 'PIX_GATEWAY_TOKEN', value: 'pix_prod_***' }
    ],
    code: `// BrisaBase Serverless Function: processPayment
export default async function handler(req, res) {
  const { amount, customerId, method } = req.body;

  console.log(\`Processing payment \${amount} BRL for customer \${customerId}\`);

  // Conciliação e persistência do documento
  return res.status(200).json({
    status: "approved",
    transactionId: "tx_" + Math.random().toString(36).substring(7),
    timestamp: new Date().toISOString()
  });
}`
  },
  {
    id: 'fn-invoice',
    name: 'generateInvoice',
    description: 'Gera PDF fiscal e armazena automaticamente no BrisaStorage',
    status: 'active',
    runtime: 'Node.js 20',
    region: 'São Paulo (sa-east-1)',
    memory: '512 MB',
    timeout: 90,
    executionsCount: '18.9K',
    executionsTotal: 18900,
    avgDuration: '820ms',
    errorRate: '0.2%',
    lastExecuted: 'há 6 minutos',
    environmentVariables: [
      { key: 'NFE_API_CERT', value: 'cert_secret_***' }
    ],
    code: `// BrisaBase Serverless Function: generateInvoice
export default async function handler(req, res) {
  const { orderId } = req.body;
  return res.status(200).json({
    invoiceNumber: "NF-" + Math.floor(100000 + Math.random() * 900000),
    pdfUrl: "https://storage.brisabase.dev/documents/invoice-" + orderId + ".pdf"
  });
}`
  },
  {
    id: 'fn-email',
    name: 'sendEmail',
    description: 'Envio de e-mails transacionais com templates dinâmicos HTML/MJML',
    status: 'active',
    runtime: 'Node.js 20',
    region: 'São Paulo (sa-east-1)',
    memory: '256 MB',
    timeout: 45,
    executionsCount: '54.1K',
    executionsTotal: 54100,
    avgDuration: '280ms',
    errorRate: '0.1%',
    lastExecuted: 'há 45 segundos',
    environmentVariables: [
      { key: 'RESEND_API_KEY', value: 're_***991' }
    ],
    code: `// BrisaBase Serverless Function: sendEmail
export default async function handler(req, res) {
  const { to, subject, templateId, vars } = req.body;
  return res.status(200).json({ status: "queued", messageId: "msg_" + Date.now() });
}`
  },
  {
    id: 'fn-resize',
    name: 'resizeImage',
    description: 'Otimização e geração de thumbnails WebP disparado por upload no Storage',
    status: 'active',
    runtime: 'Python 3.11',
    region: 'São Paulo (sa-east-1)',
    memory: '1024 MB',
    timeout: 60,
    executionsCount: '29.3K',
    executionsTotal: 29300,
    avgDuration: '610ms',
    errorRate: '0.5%',
    lastExecuted: 'há 10 minutos',
    environmentVariables: [
      { key: 'MAX_WIDTH', value: '1920' },
      { key: 'WEBP_QUALITY', value: '85' }
    ],
    code: `# BrisaBase Serverless Function: resizeImage (Python)
from PIL import Image
import io

def handler(event, context):
    file_path = event.get('filePath')
    print(f"Resizing asset at {file_path}")
    return {"status": "optimized", "variants": ["thumbnail", "medium", "large"]}`
  }
];
