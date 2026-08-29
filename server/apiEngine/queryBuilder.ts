import { projectDbManager, DbRelationshipDef } from '../db/projectDatabase';
import { ApiResource } from './schemaIntrospection';
import { securityEngine } from '../security/securityEngine';
import { SecurityContext } from '../security/types';

export interface QueryFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is' | 'isnull' | 'not' | 'contains' | 'starts_with' | 'ends_with';
  value: any;
}

export interface QuerySort {
  field: string;
  order: 'asc' | 'desc';
}

export interface ParsedQueryParams {
  selectFields?: string[];
  relationshipSelects?: { relationName: string; fields?: string[] }[];
  filters: QueryFilter[];
  orFilters?: QueryFilter[];
  sorts: QuerySort[];
  limit: number;
  offset: number;
}

export class RelationshipResolver {
  /**
   * Expands relational data for fetched rows based on requested relationships and foreign keys.
   */
  public static resolveRelationships(
    orgId: string,
    projId: string,
    envId: string,
    resource: ApiResource,
    rows: any[],
    relationshipSelects: { relationName: string; fields?: string[] }[],
    securityContext?: SecurityContext,
  ): any[] {
    if (rows.length === 0 || relationshipSelects.length === 0) return rows;

    const store = projectDbManager.getOrCreateStore(orgId, projId, envId);
    const resultRows = rows.map((r) => ({ ...r }));

    for (const relSel of relationshipSelects) {
      const relName = relSel.relationName.toLowerCase();
      const currentTable = resource.table.toLowerCase();

      // Find relationship matching from or to table
      const matchingRel = resource.relationships.find(
        (r) =>
          r.fromTable.toLowerCase() === relName ||
          r.toTable.toLowerCase() === relName
      );

      if (!matchingRel) continue;

      let targetTable = matchingRel.fromTable.toLowerCase() === currentTable ? matchingRel.toTable : matchingRel.fromTable;
      const targetRows = store.rows.get(targetTable.toLowerCase()) || [];

      resultRows.forEach((row) => {
        let matched: any[] = [];

        if (matchingRel.fromTable.toLowerCase() === currentTable) {
          // One-to-many or Many-to-one where current table holds local key
          const localVal = row[matchingRel.fromColumn];
          matched = targetRows.filter((tr) => String(tr[matchingRel.toColumn]) === String(localVal));
        } else {
          // Current table is the target of foreign key
          const localVal = row[matchingRel.toColumn];
          matched = targetRows.filter((tr) => String(tr[matchingRel.fromColumn]) === String(localVal));
        }

        // Nested relationship rows are an independent read surface and need their
        // own table policy evaluation before a requested field can be projected.
        if (securityContext) matched = securityEngine.filterRows(securityContext, targetTable, matched);

        // Filter target fields if specified
        if (relSel.fields && relSel.fields.length > 0 && !relSel.fields.includes('*')) {
          matched = matched.map((m) => {
            const trimmed: any = {};
            relSel.fields!.forEach((f) => {
              if (m[f] !== undefined) trimmed[f] = m[f];
            });
            return trimmed;
          });
        }

        // Attach relationship object or array
        if (matchingRel.type === 'one-to-one' || matchingRel.fromTable.toLowerCase() === currentTable) {
          row[relName] = matched.length > 0 ? (matchingRel.type === 'one-to-one' ? matched[0] : matched) : null;
        } else {
          row[relName] = matched;
        }
      });
    }

    return resultRows;
  }
}

export class SafeQueryBuilder {
  private static PROTECTED_FIELDS = ['password', 'password_hash', 'secret', 'refresh_token_hash', 'key_hash'];

  public static parseQueryParams(query: Record<string, any>, resource: ApiResource): ParsedQueryParams {
    const validColNames = new Set(resource.columns.map((c) => c.name.toLowerCase()));

    let selectFields: string[] | undefined;
    const relationshipSelects: { relationName: string; fields?: string[] }[] = [];

    // Parse ?select=id,name,orders(id,total)
    if (query.select && typeof query.select === 'string') {
      const rawSelect = query.select.trim();
      const parts = this.parseSelectString(rawSelect);

      const fields: string[] = [];
      for (const p of parts) {
        if (p.includes('(') && p.endsWith(')')) {
          const relMatch = p.match(/^([a-zA-Z0-9_]+)\((.*)\)$/);
          if (relMatch) {
            const relName = relMatch[1];
            const subFields = relMatch[2].split(',').map((s) => s.trim()).filter(Boolean);
            relationshipSelects.push({ relationName: relName, fields: subFields });
          }
        } else if (p === '*') {
          fields.push(...resource.columns.map((c) => c.name));
        } else if (validColNames.has(p.toLowerCase())) {
          fields.push(p);
        }
      }

      if (fields.length > 0) {
        selectFields = fields;
      }
    }

    // Default select fields if none specified or invalid
    if (!selectFields) {
      selectFields = resource.columns
        .filter((c) => !this.PROTECTED_FIELDS.includes(c.name.toLowerCase()))
        .map((c) => c.name);
    } else {
      selectFields = selectFields.filter((f) => !this.PROTECTED_FIELDS.includes(f.toLowerCase()));
    }

    // Parse filters
    const filters: QueryFilter[] = [];
    const orFilters: QueryFilter[] = [];

    for (const [key, val] of Object.entries(query)) {
      if (['select', 'order', 'limit', 'offset', 'cursor'].includes(key)) continue;

      if (key === 'or' && typeof val === 'string') {
        // e.g. ?or=(name.eq.Joao,email.eq.joao@example.com)
        const parsedOr = this.parseOrCondition(val, validColNames);
        orFilters.push(...parsedOr);
        continue;
      }

      if (validColNames.has(key.toLowerCase()) && typeof val === 'string') {
        const filter = this.parseFilterValue(key, val);
        if (filter) filters.push(filter);
      }
    }

    // Parse sorting e.g. ?order=price.desc,name.asc
    const sorts: QuerySort[] = [];
    if (query.order && typeof query.order === 'string') {
      const orderParts = query.order.split(',');
      for (const part of orderParts) {
        const [col, dir] = part.trim().split('.');
        if (validColNames.has(col.toLowerCase())) {
          sorts.push({
            field: col,
            order: dir && dir.toLowerCase() === 'desc' ? 'desc' : 'asc',
          });
        }
      }
    }

    // Parse pagination
    let limit = parseInt(query.limit, 10);
    if (isNaN(limit) || limit <= 0) limit = 50;
    if (limit > 1000) limit = 1000;

    let offset = parseInt(query.offset, 10);
    if (isNaN(offset) || offset < 0) offset = 0;

    return {
      selectFields,
      relationshipSelects,
      filters,
      orFilters: orFilters.length > 0 ? orFilters : undefined,
      sorts,
      limit,
      offset,
    };
  }

  public static executeSelect(
    orgId: string,
    projId: string,
    envId: string,
    resource: ApiResource,
    params: ParsedQueryParams,
    securityContext?: SecurityContext
  ): { data: any[]; totalCount: number; limit: number; offset: number } {
    const store = projectDbManager.getOrCreateStore(orgId, projId, envId);
    const allRows = store.rows.get(resource.table.toLowerCase()) || [];

    let filtered = [...allRows];

    // Apply AND filters
    if (params.filters.length > 0) {
      filtered = filtered.filter((row) =>
        params.filters.every((f) => this.matchFilter(row[f.field], f.operator, f.value))
      );
    }

    // Apply OR filters
    if (params.orFilters && params.orFilters.length > 0) {
      filtered = filtered.filter((row) =>
        params.orFilters!.some((f) => this.matchFilter(row[f.field], f.operator, f.value))
      );
    }

    // Filter before sort, pagination, joins, and field projection so policies always see
    // the complete source row and cannot be bypassed by query-shape changes.
    if (securityContext) {
      filtered = securityEngine.filterRows(securityContext, resource.table, filtered);
    }

    // Apply Sorts
    if (params.sorts.length > 0) {
      filtered.sort((a, b) => {
        for (const s of params.sorts) {
          const valA = a[s.field];
          const valB = b[s.field];
          const order = s.order === 'desc' ? -1 : 1;

          if (valA < valB) return -1 * order;
          if (valA > valB) return 1 * order;
        }
        return 0;
      });
    }

    const totalCount = filtered.length;
    let paginated = filtered.slice(params.offset, params.offset + params.limit);

    // Resolve Relationships if requested BEFORE stripping unselected foreign key columns
    if (params.relationshipSelects && params.relationshipSelects.length > 0) {
      paginated = RelationshipResolver.resolveRelationships(
        orgId,
        projId,
        envId,
        resource,
        paginated,
        params.relationshipSelects,
        securityContext
      );
    }

    const relNames = (params.relationshipSelects || []).map((r) => r.relationName.toLowerCase());

    // Apply Field Selection
    const data = paginated.map((row) => {
      const selectedRow: any = {};
      if (params.selectFields) {
        params.selectFields.forEach((f) => {
          if (row[f] !== undefined) selectedRow[f] = row[f];
        });
        // Preserve resolved relationship objects
        relNames.forEach((rn) => {
          if (row[rn] !== undefined) selectedRow[rn] = row[rn];
        });
      } else {
        Object.assign(selectedRow, row);
      }
      return selectedRow;
    });

    return {
      data,
      totalCount,
      limit: params.limit,
      offset: params.offset,
    };
  }

  private static parseSelectString(raw: string): string[] {
    const results: string[] = [];
    let depth = 0;
    let current = '';

    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      if (char === '(') depth++;
      if (char === ')') depth--;

      if (char === ',' && depth === 0) {
        if (current.trim()) results.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) results.push(current.trim());
    return results;
  }

  private static parseFilterValue(field: string, valStr: string): QueryFilter | null {
    const dotIdx = valStr.indexOf('.');
    if (dotIdx === -1) {
      return { field, operator: 'eq', value: valStr };
    }

    const op = valStr.substring(0, dotIdx).toLowerCase();
    const rawVal = valStr.substring(dotIdx + 1);

    switch (op) {
      case 'eq':
        return { field, operator: 'eq', value: rawVal };
      case 'neq':
        return { field, operator: 'neq', value: rawVal };
      case 'gt':
        return { field, operator: 'gt', value: parseFloat(rawVal) || rawVal };
      case 'gte':
        return { field, operator: 'gte', value: parseFloat(rawVal) || rawVal };
      case 'lt':
        return { field, operator: 'lt', value: parseFloat(rawVal) || rawVal };
      case 'lte':
        return { field, operator: 'lte', value: parseFloat(rawVal) || rawVal };
      case 'like':
        return { field, operator: 'like', value: rawVal.replace(/\*/g, '%') };
      case 'ilike':
        return { field, operator: 'ilike', value: rawVal.replace(/\*/g, '%') };
      case 'in': {
        const cleaned = rawVal.replace(/^\(|\)$/g, '');
        const items = cleaned.split(',').map((s) => s.trim());
        return { field, operator: 'in', value: items };
      }
      case 'is':
        return { field, operator: 'is', value: rawVal === 'true' ? true : rawVal === 'false' ? false : null };
      case 'isnull':
        return { field, operator: 'isnull', value: rawVal === 'true' };
      case 'contains':
        return { field, operator: 'contains', value: rawVal };
      case 'starts_with':
        return { field, operator: 'starts_with', value: rawVal };
      case 'ends_with':
        return { field, operator: 'ends_with', value: rawVal };
      default:
        return { field, operator: 'eq', value: valStr };
    }
  }

  private static parseOrCondition(valStr: string, validCols: Set<string>): QueryFilter[] {
    const cleaned = valStr.trim().replace(/^\(|\)$/g, '');
    const parts = cleaned.split(',');
    const filters: QueryFilter[] = [];

    for (const p of parts) {
      const pDot = p.indexOf('.');
      if (pDot === -1) continue;
      const col = p.substring(0, pDot);
      if (validCols.has(col.toLowerCase())) {
        const filter = this.parseFilterValue(col, p.substring(pDot + 1));
        if (filter) filters.push(filter);
      }
    }
    return filters;
  }

  private static matchFilter(cellVal: any, op: QueryFilter['operator'], filterVal: any): boolean {
    if (op === 'isnull') {
      const isNil = cellVal === null || cellVal === undefined;
      return filterVal ? isNil : !isNil;
    }

    if (cellVal === null || cellVal === undefined) return false;

    const strCell = String(cellVal).toLowerCase();
    const strFilter = String(filterVal).toLowerCase();

    switch (op) {
      case 'eq':
        return String(cellVal) === String(filterVal);
      case 'neq':
        return String(cellVal) !== String(filterVal);
      case 'gt':
        return Number(cellVal) > Number(filterVal);
      case 'gte':
        return Number(cellVal) >= Number(filterVal);
      case 'lt':
        return Number(cellVal) < Number(filterVal);
      case 'lte':
        return Number(cellVal) <= Number(filterVal);
      case 'like':
      case 'ilike':
      case 'contains':
        return strCell.includes(strFilter.replace(/%/g, ''));
      case 'starts_with':
        return strCell.startsWith(strFilter);
      case 'ends_with':
        return strCell.endsWith(strFilter);
      case 'in':
        if (Array.isArray(filterVal)) {
          return filterVal.map((v) => String(v).toLowerCase()).includes(strCell);
        }
        return false;
      case 'is':
        return cellVal === filterVal;
      default:
        return true;
    }
  }
}
