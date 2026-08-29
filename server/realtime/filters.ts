import { RealtimeCdcEvent, RealtimeSubscription } from './types';

export class EventFilterEngine {
  private static readonly ALLOWED_OPERATORS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'ilike', 'in']);

  public static matches(subscription: RealtimeSubscription, event: RealtimeCdcEvent): boolean {
    // 1. Schema check
    if (subscription.schema !== '*' && subscription.schema.toLowerCase() !== event.schema.toLowerCase()) {
      return false;
    }

    // 2. Table check
    if (subscription.table !== '*' && subscription.table.toLowerCase() !== event.table.toLowerCase()) {
      return false;
    }

    // 3. Operation check
    if (subscription.event !== '*' && subscription.event !== event.operation) {
      return false;
    }

    // 4. Custom Filter check (e.g., price=gt.100 or status=eq.paid)
    if (subscription.filter) {
      return this.evaluateFilter(subscription.filter, event.new || event.old);
    }

    return true;
  }

  public static isValidFilter(filterStr: string | undefined): boolean {
    if (!filterStr) return true;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(eq|neq|gt|gte|lt|lte|ilike|in)\.(.+)$/i.exec(filterStr.trim());
    if (!match || !this.ALLOWED_OPERATORS.has(match[2].toLowerCase())) return false;
    return Buffer.byteLength(filterStr, 'utf8') <= 512;
  }

  private static evaluateFilter(filterStr: string, rowData: Record<string, any> | null): boolean {
    if (!rowData) return false;

    // Filter format: field=op.value (e.g. "price=gt.100" or "status=eq.paid")
    if (!this.isValidFilter(filterStr)) return false;
    const parts = filterStr.split('=');

    const field = parts[0].trim();
    const opVal = parts.slice(1).join('=').trim(); // e.g. "gt.100" or "eq.paid"

    const opParts = opVal.split('.');
    const op = opParts[0].toLowerCase();
    const rawVal = opParts.slice(1).join('.');

    const rowVal = rowData[field];
    if (rowVal === undefined || rowVal === null) return false;

    switch (op) {
      case 'eq':
        return String(rowVal) === rawVal;
      case 'neq':
        return String(rowVal) !== rawVal;
      case 'gt':
        return Number(rowVal) > Number(rawVal);
      case 'gte':
        return Number(rowVal) >= Number(rawVal);
      case 'lt':
        return Number(rowVal) < Number(rawVal);
      case 'lte':
        return Number(rowVal) <= Number(rawVal);
      case 'ilike':
        return String(rowVal).toLowerCase().includes(rawVal.toLowerCase().replace(/%/g, ''));
      case 'in': {
        const setVals = rawVal.replace(/[()]/g, '').split(',').map((v) => v.trim());
        return setVals.includes(String(rowVal));
      }
      default:
        return false;
    }
  }
}
