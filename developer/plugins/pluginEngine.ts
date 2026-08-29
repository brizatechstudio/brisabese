import { createHmac, timingSafeEqual } from 'node:crypto';
import { DeveloperContext, InstalledPlugin, PluginManifest, PluginPermission } from '../types';

const PERMISSIONS = new Set<PluginPermission>(['database:read', 'database:write', 'storage:read', 'storage:write', 'functions:invoke', 'realtime:publish', 'ui:menu', 'ui:widget', 'cli:command', 'network:egress']);
const secret = () => process.env.PLUGIN_SIGNING_KEY || process.env.JWT_SECRET || 'brisabase-plugin-development-key';
const canonical = (manifest: PluginManifest) => JSON.stringify({ id: manifest.id, name: manifest.name, version: manifest.version, author: manifest.author, permissions: [...manifest.permissions].sort(), menus: manifest.menus || [], pages: manifest.pages || [], hooks: manifest.hooks || [], widgets: manifest.widgets || [], cliCommands: manifest.cliCommands || [], apiRoutes: manifest.apiRoutes || [] });
export function signPlugin(manifest: PluginManifest): string { return createHmac('sha256', secret()).update(canonical(manifest)).digest('hex'); }

export class PluginEngine {
  private installed = new Map<string, InstalledPlugin>();
  private key(context: DeveloperContext, pluginId: string): string { return `${context.organizationId}:${context.projectId}:${context.environmentId}:${pluginId}`; }
  public verify(manifest: PluginManifest): boolean { if (!manifest.signature || manifest.permissions.some((permission) => !PERMISSIONS.has(permission))) return false; const expected = Buffer.from(signPlugin({ ...manifest, signature: undefined }), 'hex'); const actual = Buffer.from(manifest.signature, 'hex'); return expected.length === actual.length && timingSafeEqual(expected, actual); }
  public install(context: DeveloperContext, manifest: PluginManifest): InstalledPlugin { if (!this.verify(manifest)) throw new Error('Plugin signature or requested permissions are invalid.'); const plugin: InstalledPlugin = { manifest: structuredClone(manifest), organizationId: context.organizationId, projectId: context.projectId, environmentId: context.environmentId, installedAt: new Date().toISOString(), installedBy: context.userId || 'system', sandbox: { isolated: true, allowedPermissions: [...manifest.permissions] } }; this.installed.set(this.key(context, manifest.id), plugin); return structuredClone(plugin); }
  public remove(context: DeveloperContext, pluginId: string): boolean { return this.installed.delete(this.key(context, pluginId)); }
  public list(context: DeveloperContext): InstalledPlugin[] { const prefix = `${context.organizationId}:${context.projectId}:${context.environmentId}:`; return Array.from(this.installed.entries()).filter(([key]) => key.startsWith(prefix)).map(([, plugin]) => structuredClone(plugin)); }
  public capabilities(context: DeveloperContext, pluginId: string): PluginPermission[] { const plugin = this.installed.get(this.key(context, pluginId)); if (!plugin) throw new Error('Plugin is not installed.'); return [...plugin.sandbox.allowedPermissions]; }
}
