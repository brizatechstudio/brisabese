import { Router } from 'express';

export const docsRouter = Router();

docsRouter.get('/api/docs', (req, res) => {
  res.json({
    openapi: '3.0.0',
    info: {
      title: 'BrisaBase BaaS REST API',
      version: '3.0.0',
      description: 'Documentação da API do BrisaBase BaaS (Fases 1, 2 e 3 - Foundation, Database & Auth Engine)',
    },
    paths: {
      '/health': { get: { summary: 'Health Check' } },
      '/health/database': { get: { summary: 'Database & Redis Connection Health Check' } },
      '/api/organizations': {
        get: { summary: 'Listar Organizações' },
        post: { summary: 'Criar Organização' }
      },
      '/api/projects': {
        get: { summary: 'Listar Projetos' },
        post: { summary: 'Criar Projeto' }
      },
      '/api/projects/{id}': {
        get: { summary: 'Obter Projeto por ID/Slug' },
        patch: { summary: 'Atualizar Projeto' },
        delete: { summary: 'Excluir Projeto' }
      },
      '/api/projects/{id}/environments': {
        get: { summary: 'Listar Ambientes do Projeto' },
        post: { summary: 'Criar Ambiente' }
      },
      '/api/projects/{id}/api-keys': {
        get: { summary: 'Listar API Keys do Projeto' },
        post: { summary: 'Criar API Key (Retorna a chave completa uma única vez)' }
      },
      '/api/api-keys/{id}/revoke': {
        post: { summary: 'Revogar API Key' }
      },
      '/api/organizations/{id}/members': {
        get: { summary: 'Listar Membros da Organização' },
        post: { summary: 'Convidar Membro' }
      },
      '/api/organizations/{id}/audit-logs': {
        get: { summary: 'Listar Logs de Auditoria da Organização' }
      },
      '/api/projects/{id}/settings': {
        get: { summary: 'Obter Configurações do Projeto' },
        post: { summary: 'Atualizar Configuração do Projeto' }
      },
      '/api/auth/signup': {
        post: { summary: 'Cadastrar Usuário de Aplicativo (Auth Engine)' }
      },
      '/api/auth/login': {
        post: { summary: 'Autenticar Usuário e Gerar JWT (Auth Engine)' }
      },
      '/api/auth/logout': {
        post: { summary: 'Encerrar Sessão Atual (Revogar Token)' }
      },
      '/api/auth/logout-all': {
        post: { summary: 'Encerrar Todas as Sessões do Usuário' }
      },
      '/api/auth/user': {
        get: { summary: 'Obter Perfil do Usuário Autenticado' }
      },
      '/api/auth/refresh': {
        post: { summary: 'Rotacionar Refresh Token e Gerar Novo JWT' }
      },
      '/api/auth/verify-email': {
        post: { summary: 'Verificar E-mail do Usuário' }
      },
      '/api/auth/resend-verification': {
        post: { summary: 'Reenviar E-mail de Confirmação' }
      },
      '/api/auth/password-reset/request': {
        post: { summary: 'Solicitar Redefinição de Senha' }
      },
      '/api/auth/password-reset/confirm': {
        post: { summary: 'Confirmar Redefinição de Senha' }
      },
      '/api/auth/password/change': {
        post: { summary: 'Alterar Senha do Usuário Autenticado' }
      },
      '/api/auth/oauth/{provider}': {
        get: { summary: 'Iniciar Redirecionamento OAuth (Google, GitHub, Apple...)' }
      },
      '/api/auth/oauth/{provider}/callback': {
        get: { summary: 'Callback OAuth do Provedor Social' }
      },
      '/api/auth/mfa/enroll': {
        post: { summary: 'Iniciar Cadastro de MFA TOTP' }
      },
      '/api/auth/mfa/verify': {
        post: { summary: 'Confirmar MFA TOTP e Gerar Códigos de Recuperação' }
      },
      '/api/auth/mfa/disable': {
        post: { summary: 'Desativar MFA' }
      },
      '/health/realtime': {
        get: { summary: 'Realtime Engine Health Check' }
      },
      '/api/realtime/status': {
        get: { summary: 'Status do Realtime Engine (WebSocket, CDC, Redis)' }
      },
      '/api/realtime/metrics': {
        get: { summary: 'Métricas do Realtime Engine' }
      },
      '/api/realtime/channels': {
        get: { summary: 'Listar Canais Realtime Ativos' }
      },
      '/api/realtime/connections': {
        get: { summary: 'Listar Conexões Realtime Ativas' }
      },
      '/api/realtime/events': {
        get: { summary: 'Listar Eventos Realtime Recentes' }
      },
      '/api/realtime/subscriptions': {
        get: { summary: 'Listar Inscrições Realtime' }
      },
      '/api/realtime/tables/{tableName}/settings': {
        get: { summary: 'Obter Configurações Realtime da Tabela' },
        patch: { summary: 'Atualizar Configurações Realtime da Tabela' }
      },
      '/api/realtime/emit': {
        post: { summary: 'Emitir Evento CDC de Teste' }
      },
      '/realtime/v1/websocket': {
        get: { summary: 'WebSocket Realtime (Protocolo: connect, join, subscribe, broadcast, presence, heartbeat)' }
      }
    }
  });
});
