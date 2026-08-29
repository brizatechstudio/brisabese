import { randomUUID } from 'node:crypto';
import { InfrastructureContext, InfrastructureRegion, ProjectRegionConfig } from './types';

const REGIONS: Array<[string, string, string, number]> = [
  ['sa-east-1', 'South America', 'South America', 22], ['us-east-1', 'US East', 'North America', 95], ['us-west-1', 'US West', 'North America', 142], ['eu-west-1', 'Europe', 'Europe', 188], ['ap-southeast-1', 'Asia', 'Asia', 280], ['ap-southeast-2', 'Australia', 'Oceania', 310],
];

export class RegionManager {
  private regions = new Map<string, InfrastructureRegion>();
  private placements = new Map<string, ProjectRegionConfig>();
  constructor() { for (const [code, name, continent, latencyMs] of REGIONS) this.regions.set(code, { id: `region_${code}`, code, name, continent, zones: ['a', 'b', 'c'].map((suffix) => ({ id: `${code}${suffix}`, region: code, status: 'available' })), status: 'healthy', latencyMs, createdAt: new Date().toISOString() }); }
  private key(context: Pick<InfrastructureContext, 'organizationId' | 'projectId' | 'environmentId'>): string { return `${context.organizationId}:${context.projectId}:${context.environmentId}`; }
  public list(): InfrastructureRegion[] { return Array.from(this.regions.values()).map((region) => structuredClone(region)); }
  public get(code: string): InfrastructureRegion | undefined { const region = this.regions.get(code); return region && structuredClone(region); }
  public setStatus(code: string, status: InfrastructureRegion['status']): InfrastructureRegion { const region = this.regions.get(code); if (!region) throw new Error('Region not found.'); region.status = status; this.regions.set(code, region); return structuredClone(region); }
  public placement(context: InfrastructureContext): ProjectRegionConfig { const current = this.placements.get(this.key(context)); if (current) return structuredClone(current); return this.setPlacement(context, { primaryRegion: 'sa-east-1', secondaryRegion: 'us-east-1', disasterRecoveryRegion: 'eu-west-1' }); }
  public setPlacement(context: InfrastructureContext, input: Pick<ProjectRegionConfig, 'primaryRegion' | 'secondaryRegion' | 'disasterRecoveryRegion'>): ProjectRegionConfig { for (const region of Object.values(input)) if (!this.regions.has(region)) throw new Error(`Unknown region '${region}'.`); if (new Set(Object.values(input)).size !== 3) throw new Error('Primary, secondary, and disaster recovery regions must be distinct.'); const next: ProjectRegionConfig = { ...input, organizationId: context.organizationId, projectId: context.projectId, environmentId: context.environmentId, updatedAt: new Date().toISOString(), updatedBy: context.userId || 'system' }; this.placements.set(this.key(context), next); return structuredClone(next); }
  public chooseAvailable(context: InfrastructureContext, excluded: string[] = []): string { const placement = this.placement(context); const candidate = [placement.primaryRegion, placement.secondaryRegion, placement.disasterRecoveryRegion].find((region) => !excluded.includes(region) && this.regions.get(region)?.status !== 'offline'); if (!candidate) throw new Error('No project region is available.'); return candidate; }
  public id(): string { return randomUUID(); }
}
