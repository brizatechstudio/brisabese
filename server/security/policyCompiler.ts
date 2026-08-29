import { CompiledPolicy, PolicyAst, SecurityContext, SecurityPolicy } from './types';

function splitTopLevel(source: string, keyword: 'and' | 'or'): string[] {
  const chunks: string[] = [];
  let start = 0; let depth = 0; let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) { if (char === quote && source[index - 1] !== '\\') quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(') { depth += 1; continue; }
    if (char === ')') { depth -= 1; continue; }
    const candidate = source.slice(index, index + keyword.length).toLowerCase();
    if (depth === 0 && candidate === keyword && /\s/.test(source[index - 1] || ' ') && /\s/.test(source[index + keyword.length] || ' ')) {
      chunks.push(source.slice(start, index).trim()); start = index + keyword.length;
    }
  }
  chunks.push(source.slice(start).trim());
  return chunks.filter(Boolean);
}

function trimOuterParentheses(source: string): string {
  const text = source.trim();
  if (!text.startsWith('(') || !text.endsWith(')')) return text;
  let depth = 0; let quote = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) { if (char === quote && text[index - 1] !== '\\') quote = ''; continue; }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')') { depth -= 1; if (depth === 0 && index < text.length - 1) return text; }
  }
  return text.slice(1, -1).trim();
}

function findOperator(source: string): { index: number; operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'starts_with'; length: number } | null {
  let depth = 0; let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) { if (char === quote && source[index - 1] !== '\\') quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(') { depth += 1; continue; }
    if (char === ')') { depth -= 1; continue; }
    if (depth !== 0) continue;
    const rest = source.slice(index);
    const word = /^\s+(starts_with|in)\s+/i.exec(rest);
    if (word) return { index, operator: word[1].toLowerCase() as 'in' | 'starts_with', length: word[0].length };
    const symbol = /^(>=|<=|!=|=|>|<)/.exec(rest);
    if (symbol) return { index, operator: symbol[1] as '=' | '!=' | '>' | '>=' | '<' | '<=', length: symbol[1].length };
  }
  return null;
}

function parseOperand(source: string): PolicyAst {
  const text = trimOuterParentheses(source);
  if (/^true$/i.test(text)) return { type: 'literal', value: true };
  if (/^false$/i.test(text)) return { type: 'literal', value: false };
  if (/^null$/i.test(text)) return { type: 'literal', value: null };
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return { type: 'literal', value: Number(text) };
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return { type: 'literal', value: text.slice(1, -1).replace(/\\(['"])/g, '$1') };
  if (/^auth\.uid\(\)$/i.test(text)) return { type: 'reference', scope: 'auth', key: 'uid' };
  if (/^auth\.role\(\)$/i.test(text)) return { type: 'reference', scope: 'auth', key: 'role' };
  const claim = /^auth\.claim\(\s*['"]([^'"]+)['"]\s*\)$/i.exec(text);
  if (claim) return { type: 'reference', scope: 'auth', key: `claim:${claim[1]}` };
  const scoped = /^(row|new|context)\.([A-Za-z_][A-Za-z0-9_]*)$/i.exec(text);
  if (scoped) return { type: 'reference', scope: scoped[1].toLowerCase() as 'row' | 'new' | 'context', key: scoped[2] };
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return { type: 'reference', scope: 'row', key: text };
  throw new Error(`Invalid policy operand '${text}'.`);
}

function parseExpression(source: string): PolicyAst {
  const text = trimOuterParentheses(source);
  const orParts = splitTopLevel(text, 'or');
  if (orParts.length > 1) return orParts.map(parseExpression).reduce((left, right) => ({ type: 'logical', operator: 'or', left, right }));
  const andParts = splitTopLevel(text, 'and');
  if (andParts.length > 1) return andParts.map(parseExpression).reduce((left, right) => ({ type: 'logical', operator: 'and', left, right }));
  const operator = findOperator(text);
  if (!operator) return parseOperand(text);
  const left = parseOperand(text.slice(0, operator.index).trim());
  const rightText = text.slice(operator.index + operator.length).trim();
  const right: PolicyAst | PolicyAst[] = operator.operator === 'in'
    ? splitTopLevel(trimOuterParentheses(rightText), 'or').flatMap((part) => part.split(',').map((value) => parseOperand(value.trim())))
    : parseOperand(rightText);
  return { type: 'comparison', operator: operator.operator, left, right };
}

function resolveReference(ast: Extract<PolicyAst, { type: 'reference' }>, context: SecurityContext, row: Record<string, any> | null | undefined, proposedRow: Record<string, any> | null | undefined, path?: string): unknown {
  if (ast.scope === 'auth') {
    if (ast.key === 'uid') return context.userId || null;
    if (ast.key === 'role') return context.role;
    if (ast.key.startsWith('claim:')) return context.claims?.[ast.key.slice(6)] ?? null;
  }
  if (ast.scope === 'new') return proposedRow?.[ast.key] ?? null;
  if (ast.scope === 'context') return ast.key === 'path' ? path ?? null : (context as any)[ast.key] ?? null;
  return ast.key === 'path' ? path ?? row?.path ?? null : row?.[ast.key] ?? null;
}

function evaluateAst(ast: PolicyAst, context: SecurityContext, row?: Record<string, any> | null, proposedRow?: Record<string, any> | null, path?: string): any {
  if (ast.type === 'literal') return ast.value;
  if (ast.type === 'reference') return resolveReference(ast, context, row, proposedRow, path);
  if (ast.type === 'logical') return ast.operator === 'and'
    ? Boolean(evaluateAst(ast.left, context, row, proposedRow, path)) && Boolean(evaluateAst(ast.right, context, row, proposedRow, path))
    : Boolean(evaluateAst(ast.left, context, row, proposedRow, path)) || Boolean(evaluateAst(ast.right, context, row, proposedRow, path));
  const left = evaluateAst(ast.left, context, row, proposedRow, path);
  const right = Array.isArray(ast.right) ? ast.right.map((entry) => evaluateAst(entry, context, row, proposedRow, path)) : evaluateAst(ast.right, context, row, proposedRow, path);
  if (ast.operator === '=') return left === right;
  if (ast.operator === '!=') return left !== right;
  if (ast.operator === '>') return typeof left === 'number' && typeof right === 'number' && left > right;
  if (ast.operator === '>=') return typeof left === 'number' && typeof right === 'number' && left >= right;
  if (ast.operator === '<') return typeof left === 'number' && typeof right === 'number' && left < right;
  if (ast.operator === '<=') return typeof left === 'number' && typeof right === 'number' && left <= right;
  if (ast.operator === 'in') return Array.isArray(right) && right.includes(left);
  return typeof left === 'string' && typeof right === 'string' && left.startsWith(right);
}

export class PolicyCompiler {
  public static compile(policy: SecurityPolicy): CompiledPolicy {
    const ast = parseExpression(policy.condition);
    return { policyId: policy.id, ast, evaluate: (context, row, proposedRow, path) => Boolean(evaluateAst(ast, context, row, proposedRow, path)) };
  }
}
