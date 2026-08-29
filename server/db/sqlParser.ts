export interface SqlValidationResult {
  safe: boolean;
  requiresConfirmation?: boolean;
  warning?: string;
  statementType: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'ALTER' | 'DROP' | 'TRUNCATE' | 'OTHER';
}

export class SqlParser {
  public static validate(query: string): SqlValidationResult {
    const trimmed = query.trim().toUpperCase();

    if (!trimmed) {
      return { safe: false, warning: 'Query vazia.', statementType: 'OTHER' };
    }

    // Detect statement type
    let statementType: SqlValidationResult['statementType'] = 'OTHER';
    if (trimmed.startsWith('SELECT')) statementType = 'SELECT';
    else if (trimmed.startsWith('INSERT')) statementType = 'INSERT';
    else if (trimmed.startsWith('UPDATE')) statementType = 'UPDATE';
    else if (trimmed.startsWith('DELETE')) statementType = 'DELETE';
    else if (trimmed.startsWith('CREATE')) statementType = 'CREATE';
    else if (trimmed.startsWith('ALTER')) statementType = 'ALTER';
    else if (trimmed.startsWith('DROP')) statementType = 'DROP';
    else if (trimmed.startsWith('TRUNCATE')) statementType = 'TRUNCATE';

    // Check for dangerous system commands
    if (trimmed.includes('DROP DATABASE') || trimmed.includes('DROP SCHEMA PUBLIC')) {
      return {
        safe: false,
        warning: 'Operação proibida: DROP DATABASE e DROP SCHEMA PUBLIC não são permitidos.',
        statementType,
      };
    }

    // Check for destructive commands requiring confirmation
    if (
      trimmed.startsWith('DROP TABLE') ||
      trimmed.startsWith('DROP SCHEMA') ||
      trimmed.startsWith('TRUNCATE') ||
      (trimmed.startsWith('DELETE') && !trimmed.includes('WHERE'))
    ) {
      return {
        safe: true,
        requiresConfirmation: true,
        warning: 'Esta instrução contém operações destrutivas. Confirme a execução.',
        statementType,
      };
    }

    return {
      safe: true,
      statementType,
    };
  }
}
