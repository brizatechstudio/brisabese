import { DatabaseCollection, DatabaseDocument } from '../types';

export const initialCollections: DatabaseCollection[] = [
  {
    id: 'users',
    name: 'users',
    description: 'Armazena perfis e credenciais de usuários da aplicação',
    count: 8732,
    size: '14.2 MB',
    createdAt: '10/01/2026',
    updatedAt: 'há 2 minutos',
    fields: [
      { name: 'name', type: 'string', required: true },
      { name: 'email', type: 'string', required: true },
      { name: 'role', type: 'string', required: true },
      { name: 'status', type: 'string', required: true },
      { name: 'createdAt', type: 'date', required: true },
      { name: 'plan', type: 'string', required: false }
    ]
  },
  {
    id: 'products',
    name: 'products',
    description: 'Catálogo de itens, SKU, preços, estoque e metadados',
    count: 1420,
    size: '8.6 MB',
    createdAt: '12/01/2026',
    updatedAt: 'há 10 minutos',
    fields: [
      { name: 'title', type: 'string', required: true },
      { name: 'price', type: 'number', required: true },
      { name: 'category', type: 'string', required: true },
      { name: 'stock', type: 'number', required: true },
      { name: 'status', type: 'string', required: true },
      { name: 'sku', type: 'string', required: true }
    ]
  },
  {
    id: 'orders',
    name: 'orders',
    description: 'Transações de pedidos, itens comprados, status e entrega',
    count: 15420,
    size: '38.4 MB',
    createdAt: '15/01/2026',
    updatedAt: 'há 1 minuto',
    fields: [
      { name: 'orderNumber', type: 'string', required: true },
      { name: 'customerEmail', type: 'string', required: true },
      { name: 'totalAmount', type: 'number', required: true },
      { name: 'itemsCount', type: 'number', required: true },
      { name: 'status', type: 'string', required: true },
      { name: 'paymentMethod', type: 'string', required: true }
    ]
  },
  {
    id: 'payments',
    name: 'payments',
    description: 'Registros de cobranças via PIX, Cartão de Crédito e Boleto',
    count: 12890,
    size: '22.1 MB',
    createdAt: '18/01/2026',
    updatedAt: 'há 4 minutos',
    fields: [
      { name: 'transactionId', type: 'string', required: true },
      { name: 'amount', type: 'number', required: true },
      { name: 'gateway', type: 'string', required: true },
      { name: 'status', type: 'string', required: true },
      { name: 'fee', type: 'number', required: false },
      { name: 'paidAt', type: 'date', required: false }
    ]
  },
  {
    id: 'customers',
    name: 'customers',
    description: 'Dados cadastrais de clientes, endereços e histórico de CRM',
    count: 6140,
    size: '9.8 MB',
    createdAt: '20/01/2026',
    updatedAt: 'há 15 minutos',
    fields: [
      { name: 'fullName', type: 'string', required: true },
      { name: 'cpfCnpj', type: 'string', required: true },
      { name: 'city', type: 'string', required: true },
      { name: 'state', type: 'string', required: true },
      { name: 'totalSpent', type: 'number', required: true }
    ]
  }
];

export const initialDocuments: Record<string, DatabaseDocument[]> = {
  users: [
    {
      id: 'doc_usr_84931a',
      collectionId: 'users',
      data: {
        name: 'Lucas Moreira',
        email: 'lucas.moreira@brisabase.dev',
        role: 'Admin',
        status: 'active',
        plan: 'Pro Enterprise',
        verified: true,
        score: 98
      },
      createdAt: '2026-01-10T14:20:00Z',
      updatedAt: '2026-02-26T17:15:00Z'
    },
    {
      id: 'doc_usr_72194b',
      collectionId: 'users',
      data: {
        name: 'Mariana Duarte',
        email: 'mariana.duarte@gmail.com',
        role: 'Customer',
        status: 'active',
        plan: 'Free Starter',
        verified: true,
        score: 84
      },
      createdAt: '2026-01-14T09:12:00Z',
      updatedAt: '2026-02-25T11:30:00Z'
    },
    {
      id: 'doc_usr_39102c',
      collectionId: 'users',
      data: {
        name: 'Thiago Castilho',
        email: 'thiago.castilho@outlook.com',
        role: 'Developer',
        status: 'active',
        plan: 'Pro Developer',
        verified: true,
        score: 92
      },
      createdAt: '2026-01-20T18:45:00Z',
      updatedAt: '2026-02-26T16:00:00Z'
    },
    {
      id: 'doc_usr_55610d',
      collectionId: 'users',
      data: {
        name: 'Renata Silveira',
        email: 'renata.silveira@uol.com.br',
        role: 'Customer',
        status: 'blocked',
        plan: 'Free Starter',
        verified: false,
        score: 35
      },
      createdAt: '2026-01-28T20:10:00Z',
      updatedAt: '2026-02-20T08:22:00Z'
    },
    {
      id: 'doc_usr_99812e',
      collectionId: 'users',
      data: {
        name: 'Gustavo Mendonça',
        email: 'gustavo.mendonca@empresa.com',
        role: 'Manager',
        status: 'active',
        plan: 'Pro Business',
        verified: true,
        score: 88
      },
      createdAt: '2026-02-02T13:40:00Z',
      updatedAt: '2026-02-26T14:10:00Z'
    }
  ],
  products: [
    {
      id: 'doc_prd_00192',
      collectionId: 'products',
      data: {
        title: 'MacBook Pro M3 Max 16"',
        price: 24999.00,
        category: 'Hardware & Eletrônicos',
        stock: 35,
        status: 'in_stock',
        sku: 'APL-MBP-M3-16'
      },
      createdAt: '2026-01-12T10:00:00Z',
      updatedAt: '2026-02-26T12:00:00Z'
    },
    {
      id: 'doc_prd_00193',
      collectionId: 'products',
      data: {
        title: 'Teclado Mecânico Wireless RGB Pro',
        price: 899.90,
        category: 'Periféricos',
        stock: 140,
        status: 'in_stock',
        sku: 'TEC-MEC-WL-PRO'
      },
      createdAt: '2026-01-15T11:30:00Z',
      updatedAt: '2026-02-26T15:20:00Z'
    },
    {
      id: 'doc_prd_00194',
      collectionId: 'products',
      data: {
        title: 'Monitor Ultrawide 34" 165Hz Curvo',
        price: 3450.00,
        category: 'Monitores',
        stock: 18,
        status: 'in_stock',
        sku: 'MON-UW-34-165'
      },
      createdAt: '2026-01-20T14:00:00Z',
      updatedAt: '2026-02-24T09:10:00Z'
    },
    {
      id: 'doc_prd_00195',
      collectionId: 'products',
      data: {
        title: 'Cadeira Ergonômica Mesh Executive',
        price: 1890.00,
        category: 'Mobiliário',
        stock: 0,
        status: 'out_of_stock',
        sku: 'CAD-ERG-MSH-01'
      },
      createdAt: '2026-01-22T16:45:00Z',
      updatedAt: '2026-02-26T08:00:00Z'
    }
  ],
  orders: [
    {
      id: 'doc_ord_7718',
      collectionId: 'orders',
      data: {
        orderNumber: '#BRISA-89201',
        customerEmail: 'lucas.moreira@brisabase.dev',
        totalAmount: 25898.90,
        itemsCount: 2,
        status: 'delivered',
        paymentMethod: 'PIX Instantâneo'
      },
      createdAt: '2026-02-25T14:22:00Z',
      updatedAt: '2026-02-26T10:15:00Z'
    },
    {
      id: 'doc_ord_7719',
      collectionId: 'orders',
      data: {
        orderNumber: '#BRISA-89202',
        customerEmail: 'mariana.duarte@gmail.com',
        totalAmount: 899.90,
        itemsCount: 1,
        status: 'processing',
        paymentMethod: 'Cartão de Crédito (3x)'
      },
      createdAt: '2026-02-26T16:40:00Z',
      updatedAt: '2026-02-26T16:45:00Z'
    },
    {
      id: 'doc_ord_7720',
      collectionId: 'orders',
      data: {
        orderNumber: '#BRISA-89203',
        customerEmail: 'gustavo.mendonca@empresa.com',
        totalAmount: 5340.00,
        itemsCount: 3,
        status: 'shipped',
        paymentMethod: 'Boleto Bancário'
      },
      createdAt: '2026-02-24T09:10:00Z',
      updatedAt: '2026-02-25T18:00:00Z'
    }
  ],
  payments: [
    {
      id: 'doc_pay_9011',
      collectionId: 'payments',
      data: {
        transactionId: 'tx_live_884910283719',
        amount: 25898.90,
        gateway: 'BrisaPay Direct',
        status: 'approved',
        fee: 25.80,
        paidAt: '2026-02-25T14:22:30Z'
      },
      createdAt: '2026-02-25T14:22:00Z',
      updatedAt: '2026-02-25T14:22:30Z'
    },
    {
      id: 'doc_pay_9012',
      collectionId: 'payments',
      data: {
        transactionId: 'tx_live_391028475819',
        amount: 899.90,
        gateway: 'Stripe Gateway',
        status: 'approved',
        fee: 14.50,
        paidAt: '2026-02-26T16:41:10Z'
      },
      createdAt: '2026-02-26T16:40:00Z',
      updatedAt: '2026-02-26T16:41:10Z'
    }
  ],
  customers: [
    {
      id: 'doc_cst_101',
      collectionId: 'customers',
      data: {
        fullName: 'Lucas Moreira dos Santos',
        cpfCnpj: '345.***.***-89',
        city: 'São Paulo',
        state: 'SP',
        totalSpent: 38400.00
      },
      createdAt: '2026-01-10T14:20:00Z',
      updatedAt: '2026-02-26T17:15:00Z'
    },
    {
      id: 'doc_cst_102',
      collectionId: 'customers',
      data: {
        fullName: 'Mariana Duarte Prado',
        cpfCnpj: '128.***.***-45',
        city: 'Campinas',
        state: 'SP',
        totalSpent: 4200.50
      },
      createdAt: '2026-01-14T09:12:00Z',
      updatedAt: '2026-02-25T11:30:00Z'
    }
  ]
};
