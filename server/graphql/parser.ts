export type GraphqlValueNode =
  | { kind: 'variable'; name: string }
  | { kind: 'scalar'; value: unknown }
  | { kind: 'list'; values: GraphqlValueNode[] }
  | { kind: 'object'; fields: Record<string, GraphqlValueNode> };

export type GraphqlField = {
  name: string;
  alias?: string;
  arguments: Record<string, GraphqlValueNode>;
  selections: GraphqlField[];
};

export type GraphqlOperation = {
  type: 'query' | 'mutation';
  name?: string;
  selections: GraphqlField[];
};

type Token = { type: 'name' | 'string' | 'number' | 'punct'; value: string; position: number };

const NAME_START = /[A-Za-z_]/;
const NAME_CONTINUE = /[A-Za-z0-9_]/;
const PUNCT = new Set(['!', '$', '(', ')', ':', '=', '@', '[', ']', '{', '}', ',']);

export class GraphqlParseError extends Error {
  constructor(message: string, public readonly position?: number) {
    super(message);
    this.name = 'GraphqlParseError';
  }
}

function tokenize(source: string): Token[] {
  if (Buffer.byteLength(source, 'utf8') > 64 * 1024) throw new GraphqlParseError('GraphQL document exceeds the 64 KB limit.');
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char) || char === ',') { index += 1; continue; }
    if (char === '#') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (NAME_START.test(char)) {
      const start = index++;
      while (index < source.length && NAME_CONTINUE.test(source[index])) index += 1;
      tokens.push({ type: 'name', value: source.slice(start, index), position: start });
      continue;
    }
    if (char === '"') {
      const start = index++;
      let value = '';
      let closed = false;
      while (index < source.length) {
        const current = source[index++];
        if (current === '"') { closed = true; break; }
        if (current === '\\') {
          if (index >= source.length) break;
          const escaped = source[index++];
          if (escaped === 'n') value += '\n';
          else if (escaped === 'r') value += '\r';
          else if (escaped === 't') value += '\t';
          else if (escaped === 'b') value += '\b';
          else if (escaped === 'f') value += '\f';
          else if (escaped === 'u') {
            const hex = source.slice(index, index + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new GraphqlParseError('Invalid GraphQL unicode escape.', index);
            value += String.fromCharCode(Number.parseInt(hex, 16));
            index += 4;
          } else value += escaped;
        } else value += current;
      }
      if (!closed) throw new GraphqlParseError('Unterminated GraphQL string.', start);
      tokens.push({ type: 'string', value, position: start });
      continue;
    }
    if (char === '-' || /[0-9]/.test(char)) {
      const start = index++;
      while (index < source.length && /[0-9.eE+-]/.test(source[index])) index += 1;
      const value = source.slice(start, index);
      if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) throw new GraphqlParseError('Invalid GraphQL number.', start);
      tokens.push({ type: 'number', value, position: start });
      continue;
    }
    if (PUNCT.has(char)) {
      tokens.push({ type: 'punct', value: char, position: index });
      index += 1;
      continue;
    }
    throw new GraphqlParseError(`Unexpected GraphQL character '${char}'.`, index);
  }
  return tokens;
}

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(value?: string): Token | undefined {
    const token = this.tokens[this.index];
    return value === undefined || token?.value === value ? token : undefined;
  }

  private take(value?: string): Token {
    const token = this.tokens[this.index];
    if (!token) throw new GraphqlParseError('Unexpected end of GraphQL document.');
    if (value !== undefined && token.value !== value) throw new GraphqlParseError(`Expected '${value}' but found '${token.value}'.`, token.position);
    this.index += 1;
    return token;
  }

  private name(): string {
    const token = this.take();
    if (token.type !== 'name') throw new GraphqlParseError(`Expected a GraphQL name but found '${token.value}'.`, token.position);
    return token.value;
  }

  public document(): GraphqlOperation[] {
    const operations: GraphqlOperation[] = [];
    while (this.index < this.tokens.length) operations.push(this.operation());
    if (!operations.length) throw new GraphqlParseError('GraphQL document is empty.');
    return operations;
  }

  private operation(): GraphqlOperation {
    if (this.peek('{')) return { type: 'query', selections: this.selectionSet(0) };
    const typeName = this.name();
    if (typeName === 'subscription') throw new GraphqlParseError('GraphQL subscriptions use the BrisaBase Realtime WebSocket API in v1.');
    if (typeName !== 'query' && typeName !== 'mutation') throw new GraphqlParseError(`Unsupported GraphQL operation '${typeName}'.`);
    const type = typeName as 'query' | 'mutation';
    let name: string | undefined;
    if (this.peek()?.type === 'name') name = this.name();
    if (this.peek('(')) this.variableDefinitions();
    while (this.peek('@')) this.directive();
    return { type, name, selections: this.selectionSet(0) };
  }

  private variableDefinitions(): void {
    this.take('(');
    while (!this.peek(')')) {
      this.take('$');
      this.name();
      this.take(':');
      this.typeReference();
      if (this.peek('=')) { this.take('='); this.value(0); }
      while (this.peek('@')) this.directive();
    }
    this.take(')');
  }

  private typeReference(): void {
    if (this.peek('[')) { this.take('['); this.typeReference(); this.take(']'); }
    else this.name();
    if (this.peek('!')) this.take('!');
  }

  private directive(): void {
    this.take('@');
    this.name();
    if (this.peek('(')) this.arguments();
  }

  private selectionSet(depth: number): GraphqlField[] {
    if (depth > 8) throw new GraphqlParseError('GraphQL selection depth exceeds the limit of 8.');
    this.take('{');
    const fields: GraphqlField[] = [];
    while (!this.peek('}')) {
      if (fields.length >= 100) throw new GraphqlParseError('GraphQL selection set exceeds 100 fields.');
      fields.push(this.field(depth + 1));
    }
    this.take('}');
    return fields;
  }

  private field(depth: number): GraphqlField {
    const first = this.name();
    let alias: string | undefined;
    let name = first;
    if (this.peek(':')) { this.take(':'); alias = first; name = this.name(); }
    const args = this.peek('(') ? this.arguments() : {};
    while (this.peek('@')) this.directive();
    const selections = this.peek('{') ? this.selectionSet(depth) : [];
    return { name, alias, arguments: args, selections };
  }

  private arguments(): Record<string, GraphqlValueNode> {
    this.take('(');
    const args: Record<string, GraphqlValueNode> = {};
    while (!this.peek(')')) {
      const key = this.name();
      this.take(':');
      if (args[key]) throw new GraphqlParseError(`Duplicate GraphQL argument '${key}'.`);
      args[key] = this.value(0);
    }
    this.take(')');
    return args;
  }

  private value(depth: number): GraphqlValueNode {
    if (depth > 16) throw new GraphqlParseError('GraphQL value nesting exceeds the limit.');
    const token = this.peek();
    if (!token) throw new GraphqlParseError('Expected a GraphQL value.');
    if (token.value === '$') { this.take('$'); return { kind: 'variable', name: this.name() }; }
    if (token.value === '[') {
      this.take('[');
      const values: GraphqlValueNode[] = [];
      while (!this.peek(']')) values.push(this.value(depth + 1));
      this.take(']');
      return { kind: 'list', values };
    }
    if (token.value === '{') {
      this.take('{');
      const fields: Record<string, GraphqlValueNode> = {};
      while (!this.peek('}')) {
        const key = this.name();
        this.take(':');
        fields[key] = this.value(depth + 1);
      }
      this.take('}');
      return { kind: 'object', fields };
    }
    this.take();
    if (token.type === 'string') return { kind: 'scalar', value: token.value };
    if (token.type === 'number') return { kind: 'scalar', value: token.value.includes('.') || /e/i.test(token.value) ? Number(token.value) : Number.parseInt(token.value, 10) };
    if (token.type === 'name') {
      if (token.value === 'true') return { kind: 'scalar', value: true };
      if (token.value === 'false') return { kind: 'scalar', value: false };
      if (token.value === 'null') return { kind: 'scalar', value: null };
      return { kind: 'scalar', value: token.value };
    }
    throw new GraphqlParseError(`Invalid GraphQL value '${token.value}'.`, token.position);
  }
}

export function parseGraphql(source: string): GraphqlOperation[] {
  return new Parser(tokenize(source)).document();
}

export function resolveGraphqlValue(node: GraphqlValueNode | undefined, variables: Record<string, unknown>): unknown {
  if (!node) return undefined;
  if (node.kind === 'variable') {
    if (!(node.name in variables)) throw new GraphqlParseError(`GraphQL variable '$${node.name}' was not provided.`);
    return variables[node.name];
  }
  if (node.kind === 'scalar') return node.value;
  if (node.kind === 'list') return node.values.map((item) => resolveGraphqlValue(item, variables));
  return Object.fromEntries(Object.entries(node.fields).map(([key, value]) => [key, resolveGraphqlValue(value, variables)]));
}
