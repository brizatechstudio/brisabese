import { TeamMember } from '../types';
import { INITIAL_TEAM_MEMBERS } from '../mocks/mockTeam';

export interface TeamService {
  listMembers(): Promise<TeamMember[]>;
  inviteMember(email: string, role: TeamMember['role']): Promise<TeamMember>;
  updateMemberRole(memberId: string, role: TeamMember['role']): Promise<TeamMember>;
  removeMember(memberId: string): Promise<void>;
}

export class MockTeamService implements TeamService {
  private members: TeamMember[] = [...INITIAL_TEAM_MEMBERS];

  async listMembers(): Promise<TeamMember[]> {
    return [...this.members];
  }

  async inviteMember(email: string, role: TeamMember['role']): Promise<TeamMember> {
    const newMem: TeamMember = {
      id: `tm_${Math.random().toString(36).substring(2, 9)}`,
      name: email.split('@')[0],
      email,
      avatarUrl: '',
      role,
      status: 'pending',
      lastActive: 'Convite enviado'
    };
    this.members.push(newMem);
    return newMem;
  }

  async updateMemberRole(memberId: string, role: TeamMember['role']): Promise<TeamMember> {
    const mem = this.members.find((m) => m.id === memberId);
    if (!mem) throw new Error('Membro não encontrado');
    mem.role = role;
    return { ...mem };
  }

  async removeMember(memberId: string): Promise<void> {
    this.members = this.members.filter((m) => m.id !== memberId);
  }
}

export const mockTeamService = new MockTeamService();

export class ApiTeamService implements TeamService {
  private organizationId(): string { const id = window.localStorage.getItem('brisabase.organizationId'); if (!id) throw new Error('No active organization is selected.'); return id; }
  private async request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(path, init); if (response.status === 204) return undefined as T; const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error?.message || `Team request failed (${response.status}).`); return body as T; }
  private map(value: any): TeamMember { const role = String(value.role || 'viewer'); return { id: value.id, name: value.user?.name || value.user?.email || value.email || '', email: value.user?.email || value.email || '', avatarUrl: value.user?.avatar_url || '', role: `${role.slice(0,1).toUpperCase()}${role.slice(1)}` as TeamMember['role'], status: value.user?.status === 'pending' ? 'pending' : 'active', lastActive: value.user?.last_login_at || value.updated_at || value.created_at || '', addedAt: value.created_at }; }
  async listMembers(): Promise<TeamMember[]> { const members = await this.request<any[]>(`/api/organizations/${encodeURIComponent(this.organizationId())}/members`); return members.map((value) => this.map(value)); }
  async inviteMember(email: string, role: TeamMember['role']): Promise<TeamMember> { const created = await this.request<any>(`/api/organizations/${encodeURIComponent(this.organizationId())}/members`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,role:role.toLowerCase()})}); return this.map(created); }
  async updateMemberRole(memberId: string, role: TeamMember['role']): Promise<TeamMember> { const updated = await this.request<any>(`/api/organization-members/${encodeURIComponent(memberId)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({role:role.toLowerCase()})}); return this.map(updated); }
  async removeMember(memberId: string): Promise<void> { await this.request<void>(`/api/organization-members/${encodeURIComponent(memberId)}`,{method:'DELETE'}); }
}

export const realTeamService = new ApiTeamService();
