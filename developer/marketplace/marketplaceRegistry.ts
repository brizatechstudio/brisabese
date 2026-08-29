import { randomUUID } from 'node:crypto';
import { MarketplaceItem } from '../types';

export class MarketplaceRegistry {
  private items = new Map<string, MarketplaceItem>();
  constructor() { const now = new Date().toISOString(); [
    { name: 'Stripe Payments', slug: 'stripe-payments', category: 'integration' as const, description: 'Stripe webhook and checkout integration.' },
    { name: 'Email Functions', slug: 'email-functions', category: 'function' as const, description: 'Transactional email function templates.' },
    { name: 'Admin Dashboard', slug: 'admin-dashboard', category: 'template' as const, description: 'Ready-to-deploy dashboard template.' },
    { name: 'Observability Widget', slug: 'observability-widget', category: 'component' as const, description: 'Live metrics dashboard widget.' },
  ].forEach((seed) => this.items.set(seed.slug, { id: `market_${seed.slug}`, ...seed, version: '1.0.0', author: 'BrisaBase', dependencies: [], rating: 4.8, ratingsCount: 12, changelog: 'Initial marketplace release.', signed: true, createdAt: now, updatedAt: now })); }
  public list(category?: MarketplaceItem['category']): MarketplaceItem[] { return Array.from(this.items.values()).filter((item) => !category || item.category === category).map((item) => structuredClone(item)); }
  public get(idOrSlug: string): MarketplaceItem | undefined { const item = this.items.get(idOrSlug) || Array.from(this.items.values()).find((candidate) => candidate.id === idOrSlug); return item && structuredClone(item); }
  public publish(input: Omit<MarketplaceItem, 'id' | 'createdAt' | 'updatedAt' | 'signed'> & Partial<Pick<MarketplaceItem, 'id' | 'createdAt' | 'updatedAt' | 'signed'>>): MarketplaceItem { if (!input.name?.trim() || !input.slug?.trim()) throw new Error('Marketplace item name and slug are required.'); const now = new Date().toISOString(); const item: MarketplaceItem = { ...input, id: input.id || `market_${randomUUID().replace(/-/g, '').slice(0, 18)}`, signed: input.signed ?? false, createdAt: input.createdAt || now, updatedAt: now }; this.items.set(item.slug, item); return structuredClone(item); }
}
