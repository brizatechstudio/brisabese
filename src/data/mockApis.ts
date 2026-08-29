import { ApiService } from '../types';

export const initialApis: ApiService[] = [
  {
    id: 'api-users',
    name: 'Users API',
    description: 'Endpoints REST para gestão de contas, perfis e autenticação',
    baseUrl: 'https://api.brisabase.dev/v1/users',
    status: 'active',
    requests: '1.4M / mês',
    latency: '45ms',
    errorRate: '0.05%',
    endpoints: [
      {
        id: 'ep-1',
        method: 'GET',
        path: '/users',
        description: 'Lista todos os usuários com suporte a paginação e filtros',
        status: 'active',
        headers: { 'Authorization': 'Bearer brisa_pk_live_***', 'Content-Type': 'application/json' },
        mockResponse: {
          status: 200,
          total: 8732,
          page: 1,
          limit: 20,
          data: [
            { id: 'usr_1', name: 'Lucas Moreira', email: 'lucas.moreira@brisabase.dev', role: 'Admin' },
            { id: 'usr_2', name: 'Beatriz Vasconcelos', email: 'beatriz.vasc@empresa.com.br', role: 'Developer' }
          ]
        }
      },
      {
        id: 'ep-2',
        method: 'POST',
        path: '/users',
        description: 'Cadastra um novo usuário no banco e dispara boas-vindas',
        status: 'active',
        headers: { 'Authorization': 'Bearer brisa_pk_live_***', 'Content-Type': 'application/json' },
        mockResponse: {
          status: 201,
          message: 'Usuário criado com sucesso',
          user: { id: 'usr_new_99', name: 'Novo Usuário', email: 'novo@empresa.com', createdAt: '2026-02-26T18:00:00Z' }
        }
      },
      {
        id: 'ep-3',
        method: 'GET',
        path: '/users/:id',
        description: 'Retorna os detalhes completos do usuário pelo ID ou UID',
        status: 'active',
        headers: { 'Authorization': 'Bearer brisa_pk_live_***' },
        mockResponse: {
          status: 200,
          user: { id: 'usr_1', name: 'Lucas Moreira', email: 'lucas.moreira@brisabase.dev', role: 'Admin', verified: true }
        }
      },
      {
        id: 'ep-4',
        method: 'DELETE',
        path: '/users/:id',
        description: 'Remove logicamente ou fisicamente o usuário informado',
        status: 'active',
        headers: { 'Authorization': 'Bearer brisa_pk_live_***' },
        mockResponse: {
          status: 200,
          deleted: true,
          message: 'Usuário removido da base'
        }
      }
    ]
  },
  {
    id: 'api-products',
    name: 'Products API',
    description: 'Catálogo de e-commerce, buscas por categoria, estoque e precificação',
    baseUrl: 'https://api.brisabase.dev/v1/products',
    status: 'active',
    requests: '2.1M / mês',
    latency: '38ms',
    errorRate: '0.02%',
    endpoints: [
      {
        id: 'ep-p1',
        method: 'GET',
        path: '/products',
        description: 'Recupera catálogo de produtos ativos',
        status: 'active',
        headers: { 'Authorization': 'Bearer brisa_pk_live_***' },
        mockResponse: {
          status: 200,
          count: 1420,
          items: [
            { id: 'prd_1', title: 'MacBook Pro M3 Max', price: 24999.00, stock: 35 },
            { id: 'prd_2', title: 'Teclado Mecânico Wireless RGB Pro', price: 899.90, stock: 140 }
          ]
        }
      },
      {
        id: 'ep-p2',
        method: 'POST',
        path: '/products',
        description: 'Cria um novo item no catálogo com fotos e metadados',
        status: 'active',
        headers: { 'Authorization': 'Bearer brisa_pk_live_***' },
        mockResponse: {
          status: 201,
          productId: 'prd_new_881',
          created: true
        }
      }
    ]
  },
  {
    id: 'api-orders',
    name: 'Orders API',
    description: 'Gestão de checkout, tracking de envio e integração com ERPs',
    baseUrl: 'https://api.brisabase.dev/v1/orders',
    status: 'active',
    requests: '890K / mês',
    latency: '62ms',
    errorRate: '0.1%',
    endpoints: [
      {
        id: 'ep-o1',
        method: 'POST',
        path: '/orders',
        description: 'Submete novo pedido e inicia validação de estoque',
        status: 'active',
        headers: { 'Authorization': 'Bearer brisa_pk_live_***' },
        mockResponse: {
          httpCode: 201,
          orderId: 'ord_99018',
          orderStatus: 'pending_payment',
          total: 1290.00
        }
      }
    ]
  },
  {
    id: 'api-payments',
    name: 'Payments API',
    description: 'Integração de pagamentos instantâneos PIX, cartão e boletos',
    baseUrl: 'https://api.brisabase.dev/v1/payments',
    status: 'active',
    requests: '640K / mês',
    latency: '78ms',
    errorRate: '0.08%',
    endpoints: [
      {
        id: 'ep-pay1',
        method: 'POST',
        path: '/payments/charge',
        description: 'Gera cobrança PIX com QR Code dinâmico e webhook',
        status: 'active',
        headers: { 'Authorization': 'Bearer brisa_pk_live_***' },
        mockResponse: {
          status: 200,
          qrCode: '00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-426614174000',
          copyPaste: 'pix.brisabase.dev/pay/tx_9981',
          expiresInSeconds: 3600
        }
      }
    ]
  }
];
