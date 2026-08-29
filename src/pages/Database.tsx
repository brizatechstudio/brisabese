import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Braces, Database as DatabaseIcon, Network, Table2 } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { SqlEditor } from '../components/database/SqlEditor';
import { SqlTableEditor } from '../components/database/SqlTableEditor';
import { RealSqlTableEditor } from '../components/database/RealSqlTableEditor';
import { isRealMode } from '../services/runtime';
import { SqlConnections } from '../components/database/SqlConnections';
import { NoSqlDatabase } from './NoSqlDatabase';

export const Database: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [schemaRevision, setSchemaRevision] = useState(0);
  const segment = location.pathname.split('/')[2];
  const activeTab = segment === 'sql' || segment === 'nosql' || segment === 'connections' ? segment : 'tables';
  const setActiveTab = (tab: string) => navigate(tab === 'tables' ? '/database' : `/database/${tab}`);

  const handleSchemaChanged = () => setSchemaRevision((value) => value + 1);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Banco de Dados"
        subtitle={isRealMode ? "PostgreSQL real com Table Editor, SQL Editor, migrations, relações, índices e isolamento por projeto. NoSQL avançado permanece mock por enquanto." : "Modele dados relacionais em PostgreSQL, execute SQL e mantenha coleções NoSQL no mesmo console em modo simulado."}
        badge={<Badge variant={isRealMode ? "success" : "cyan"} dot>{isRealMode ? "BrisaDB • REAL" : "BrisaDB Mock Engine"}</Badge>}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/data-platform')}>
            Abrir Data Platform
          </Button>
        }
      />

      <div className="rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl overflow-hidden">
        <div className="px-5 pt-4">
          <Tabs
            tabs={[
              { id: 'tables', label: 'Table Editor', icon: <Table2 className="w-4 h-4" /> },
              { id: 'sql', label: 'SQL Editor', icon: <Braces className="w-4 h-4" /> },
              { id: 'nosql', label: 'NoSQL / Documentos', icon: <DatabaseIcon className="w-4 h-4" /> },
              { id: 'connections', label: 'Conexões', icon: <Network className="w-4 h-4" /> }
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
        </div>

        <div className="p-5">
          {activeTab === 'tables' && (
            isRealMode ? (
              <RealSqlTableEditor revision={schemaRevision} onOpenSql={() => setActiveTab('sql')} onSchemaChange={handleSchemaChanged} />
            ) : (
              <SqlTableEditor
                revision={schemaRevision}
                onOpenSql={() => setActiveTab('sql')}
                onSchemaChange={handleSchemaChanged}
              />
            )
          )}
          {activeTab === 'sql' && <SqlEditor onSchemaChange={handleSchemaChanged} />}
          {activeTab === 'nosql' && <NoSqlDatabase embedded />}
          {activeTab === 'connections' && <SqlConnections />}
        </div>
      </div>
    </div>
  );
};
