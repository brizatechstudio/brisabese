import React from 'react';
import { DbRelationship, TableSchema } from '../../types';
import { Network, Database, ArrowRight, Trash2 } from 'lucide-react';

interface RelationshipsGraphProps {
  relationships: DbRelationship[];
  tables: TableSchema[];
  onDelete?: (relationship: DbRelationship) => void;
}

export const RelationshipsGraph: React.FC<RelationshipsGraphProps> = ({ relationships, tables, onDelete }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Network className="w-4 h-4 text-purple-400" />
            Diagrama de Relacionamentos do Banco de Dados
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Mapeamento de chaves estrangeiras (Foreign Keys) e cardinalidades do modelo relacional.
          </p>
        </div>
      </div>

      {/* Visual Relationship Cards Node Flow */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tables.map((t) => {
          const outgoing = relationships.filter((r) => r.fromTable === t.name);
          const incoming = relationships.filter((r) => r.toTable === t.name);

          return (
            <div
              key={t.name}
              className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3 shadow-lg hover:border-purple-500/30 transition-all"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2 font-mono text-sm font-bold text-slate-100">
                  <Database className="w-4 h-4 text-purple-400" />
                  <span>{t.name}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded">
                  {t.columns.length} colunas
                </span>
              </div>

              {/* Table Columns List */}
              <div className="space-y-1 font-mono text-xs">
                {t.columns.map((col) => (
                  <div key={col.name} className="flex items-center justify-between text-slate-300 py-0.5">
                    <span className={col.isPrimaryKey ? 'text-purple-400 font-bold' : ''}>{col.name}</span>
                    <span className="text-[10px] text-slate-500">{col.type}</span>
                  </div>
                ))}
              </div>

              {/* Connected Relationships Badges */}
              {(outgoing.length > 0 || incoming.length > 0) && (
                <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Relacionamentos
                  </span>
                  {outgoing.map((rel) => (
                    <div key={rel.id} className="flex items-center gap-1.5 text-[11px] text-purple-300 font-mono bg-purple-950/40 p-1.5 rounded border border-purple-800/30">
                      <span>{rel.fromColumn}</span>
                      <ArrowRight className="w-3 h-3 text-purple-400" />
                      <span>{rel.toTable}.{rel.toColumn}</span>
                      <span className="ml-auto text-[9px] text-purple-400 bg-purple-900/80 px-1 py-0.2 rounded">{rel.type}</span>
                      {onDelete && <button onClick={() => onDelete(rel)} className="p-0.5 text-slate-500 hover:text-rose-400" title="Remover foreign key"><Trash2 className="h-3 w-3" /></button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
