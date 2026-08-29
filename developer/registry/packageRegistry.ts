import { randomUUID } from 'node:crypto';

export interface RegistryPackage { id: string; name: string; version: string; kind: 'sdk' | 'plugin' | 'template' | 'function'; versions: string[]; publishedAt: string; }
export class PackageRegistry {
  private packages = new Map<string, RegistryPackage>();
  public publish(name: string, version: string, kind: RegistryPackage['kind']): RegistryPackage { if (!name || !version) throw new Error('Package name and version are required.'); const current = this.packages.get(name); const next: RegistryPackage = current ? { ...current, version, versions: [...new Set([...current.versions, version])] } : { id: `pkg_${randomUUID().replace(/-/g, '').slice(0, 18)}`, name, version, kind, versions: [version], publishedAt: new Date().toISOString() }; this.packages.set(name, next); return structuredClone(next); }
  public rollback(name: string, version: string): RegistryPackage { const current = this.packages.get(name); if (!current || !current.versions.includes(version)) throw new Error('Requested package version was not found.'); const next = { ...current, version }; this.packages.set(name, next); return structuredClone(next); }
  public list(): RegistryPackage[] { return Array.from(this.packages.values()).map((item) => structuredClone(item)); }
}
