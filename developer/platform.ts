import { db } from '../server/db/database';
import { observability } from '../server/observability';
import { CodeGenerator } from './generators/codeGenerator';
import { DocumentationEngine } from './documentation/documentationEngine';
import { ideExtensions } from './extensions/manifest';
import { MarketplaceRegistry } from './marketplace/marketplaceRegistry';
import { Playground } from './playground';
import { PluginEngine, signPlugin } from './plugins/pluginEngine';
import { SdkGenerator } from './sdk/generator';
import { TemplateRegistry } from './templates/templateRegistry';
import { PackageRegistry } from './registry/packageRegistry';
import { officialPackages } from './packages/manifest';
import { gitProviders } from './integrations/git';
import { DeveloperContext, GenerationRequest, PluginManifest, SdkTarget } from './types';

export class DeveloperPlatform {
  public readonly sdk = new SdkGenerator();
  public readonly templates = new TemplateRegistry();
  public readonly marketplace = new MarketplaceRegistry();
  public readonly plugins = new PluginEngine();
  public readonly docs = new DocumentationEngine();
  public readonly generators = new CodeGenerator();
  public readonly playground = new Playground();
  public readonly registry = new PackageRegistry();
  public readonly extensions = ideExtensions;
  public readonly gitProviders = gitProviders;
  constructor() { officialPackages.forEach((item) => this.registry.publish(`brisabase-${item.target}`, item.version, 'sdk')); }
  private assertManage(context: DeveloperContext): void { if (!['owner', 'admin', 'developer', 'service', 'service_role'].includes(context.role)) throw new Error('This developer-platform operation requires owner, admin, developer, or service access.'); }
  private audit(context: DeveloperContext, action: string, resourceId?: string, metadata: Record<string, unknown> = {}): void { db.logAudit({ organization_id: context.organizationId, project_id: context.projectId, environment_id: context.environmentId, user_id: context.userId || 'system', action, resource_type: 'developer_platform', resource_id: resourceId, metadata: { ...metadata, requestId: context.requestId }, ip_address: context.ip, user_agent: context.userAgent }); observability.metric(`developer.${action}`, 1, 'counter', {}, { organizationId: context.organizationId, projectId: context.projectId, environmentId: context.environmentId, userId: context.userId, requestId: context.requestId, service: 'developer-platform' }); }
  public generateSdk(context: DeveloperContext, target: SdkTarget, version?: string) { this.assertManage(context); const artifact = this.sdk.generate(target, version); this.audit(context, 'sdk.generated', artifact.id, { target, version: artifact.version }); return artifact; }
  public generateCode(context: DeveloperContext, input: GenerationRequest) { this.assertManage(context); const generated = this.generators.generate(input); this.audit(context, 'project.generated', undefined, { resource: input.resource, target: input.target, files: Object.keys(generated.files) }); return generated; }
  public installPlugin(context: DeveloperContext, manifest: PluginManifest) { this.assertManage(context); const plugin = this.plugins.install(context, manifest); this.audit(context, 'plugin.installed', manifest.id, { name: manifest.name, permissions: manifest.permissions }); return plugin; }
  public pluginCatalog(): PluginManifest[] { const plugin: PluginManifest = { id: 'plugin-project-inspector', name: 'Project Inspector', version: '1.0.0', author: 'BrisaBase', permissions: ['database:read', 'ui:menu', 'ui:widget'], menus: [{ label: 'Inspector', path: '/inspector' }], widgets: ['project-health'] }; return [{ ...plugin, signature: signPlugin(plugin) }]; }
  public removePlugin(context: DeveloperContext, id: string): boolean { this.assertManage(context); const removed = this.plugins.remove(context, id); if (removed) this.audit(context, 'plugin.removed', id); return removed; }
  public createTemplate(context: DeveloperContext, input: Parameters<TemplateRegistry['create']>[0]) { this.assertManage(context); const template = this.templates.create(input); this.audit(context, 'template.created', template.id, { name: template.name, framework: template.framework }); return template; }
  public async executePlayground(context: DeveloperContext, input: Parameters<Playground['run']>[1]) { this.assertManage(context); const result = await this.playground.run(context, input); this.audit(context, 'playground.executed', undefined, { service: input.service, action: input.action }); return result; }
  public overview(context: DeveloperContext) { return { sdks: this.sdk.list(), templates: this.templates.list(), marketplace: this.marketplace.list(), plugins: this.plugins.list(context), documentation: this.docs.list(), extensions: this.extensions, gitProviders: this.gitProviders, packages: this.registry.list(), updates: { cli: { current: '1.0.0', latest: '1.0.0', available: false }, sdk: { current: '1.0.0', latest: '1.0.0', available: false } } }; }
}

export const developerPlatform = new DeveloperPlatform();
