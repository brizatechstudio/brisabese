import { DocumentationEntry } from '../types';

export class DocumentationEngine {
  private entries: DocumentationEntry[] = [
    { id: 'quickstart', title: 'Quickstart', section: 'guide', content: 'Create a project, save brisabase.json, and initialize the official SDK.', tags: ['sdk', 'cli', 'quickstart'], updatedAt: new Date().toISOString() },
    { id: 'cli-reference', title: 'CLI reference', section: 'reference', content: 'Use brisabase init, dev, deploy, logs, monitor, backup and doctor to operate a project.', tags: ['cli', 'reference'], updatedAt: new Date().toISOString() },
    { id: 'plugins-security', title: 'Plugin security', section: 'guide', content: 'Plugins declare permissions, have an integrity signature, and run in an isolated capability sandbox.', tags: ['plugins', 'security'], updatedAt: new Date().toISOString() },
    { id: 'migration-v1', title: 'Migration guide', section: 'migration', content: 'Move existing clients to the generated SDK packages without changing API endpoints.', tags: ['migration', 'sdk'], updatedAt: new Date().toISOString() },
  ];
  public list(section?: DocumentationEntry['section']): DocumentationEntry[] { return this.entries.filter((entry) => !section || entry.section === section).map((entry) => structuredClone(entry)); }
  public search(query: string): DocumentationEntry[] { const needle = query.trim().toLowerCase(); if (!needle) return this.list(); return this.entries.filter((entry) => `${entry.title} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase().includes(needle)).map((entry) => structuredClone(entry)); }
}
