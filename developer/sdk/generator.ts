import { randomUUID } from 'node:crypto';
import { SdkArtifact, SdkTarget } from '../types';

type TargetConfig = [SdkTarget, string, string, 'official' | 'preview'];
const TARGETS: TargetConfig[] = [
  ['typescript', '@brisabase/js', 'TypeScript', 'official'], ['javascript', '@brisabase/js', 'JavaScript', 'official'],
  ['node', '@brisabase/node', 'Node.js', 'preview'], ['react', '@brisabase/react', 'React', 'preview'], ['react-native', '@brisabase/react-native', 'React Native', 'preview'], ['next', '@brisabase/next', 'Next.js', 'preview'], ['vue', '@brisabase/vue', 'Vue', 'preview'], ['nuxt', '@brisabase/nuxt', 'Nuxt', 'preview'], ['angular', '@brisabase/angular', 'Angular', 'preview'], ['svelte', '@brisabase/svelte', 'Svelte', 'preview'], ['flutter', 'brisabase_flutter', 'Dart', 'preview'], ['kotlin', 'brisabase-kotlin', 'Kotlin', 'preview'], ['swift', 'BrisaBaseSwift', 'Swift', 'preview'], ['python', 'brisabase', 'Python', 'preview'], ['go', 'github.com/brisabase/go', 'Go', 'preview'], ['java', 'dev.brisabase:java', 'Java', 'preview'], ['csharp', 'BrisaBase.SDK', 'C#', 'preview'], ['php', 'brisabase/sdk', 'PHP', 'preview'], ['rust', 'brisabase', 'Rust', 'preview'],
];
function source(target: SdkTarget, packageName: string, maturity: 'official' | 'preview'): string {
  if (maturity === 'official') return `import { createClient } from '@brisabase/js';\nexport const client = createClient({ url: 'https://api.example', projectId: 'project-id', environmentId: 'environment-id', apiKey: 'bb_pub_...' });\n`;
  const warning = '// PREVIEW GENERATOR ONLY — this package is not published as an official BrisaBase SDK.\n';
  if (target === 'python') return `${warning}# Future package concept: ${packageName}\n`;
  if (target === 'go') return `${warning}// Future package concept: ${packageName}\n`;
  return `${warning}// Future package concept: ${packageName}\n`;
}
export class SdkGenerator {
  private artifacts = new Map<SdkTarget, SdkArtifact>();
  public supported(): SdkTarget[] { return TARGETS.map(([target]) => target); }
  public official(): SdkTarget[] { return TARGETS.filter(([, , , maturity]) => maturity === 'official').map(([target]) => target); }
  public generate(target: SdkTarget, version = '1.0.0'): SdkArtifact { const config = TARGETS.find(([name]) => name === target); if (!config) throw new Error(`Unsupported SDK target '${target}'.`); const [, packageName, language, maturity] = config; const artifact: SdkArtifact = { id: `sdk_${randomUUID().replace(/-/g, '').slice(0, 18)}`, target, packageName, version, language, maturity, source: source(target, packageName, maturity), generatedAt: new Date().toISOString(), changelog: maturity === 'official' ? `Official ${language} SDK ${version}.` : `Preview ${language} generator ${version}; package is not published.` }; this.artifacts.set(target, artifact); return structuredClone(artifact); }
  public generateAll(version = '1.0.0'): SdkArtifact[] { return this.supported().map((target) => this.generate(target, version)); }
  public list(): SdkArtifact[] { if (!this.artifacts.size) this.generateAll(); return Array.from(this.artifacts.values()).map((artifact) => structuredClone(artifact)); }
}
