import { SdkTarget } from '../types';
export const officialPackages: Array<{ target: SdkTarget; packageName: string; version: string; status: 'published' }> = [
  { target: 'typescript', packageName: '@brisabase/js', version: '1.0.0', status: 'published' },
  { target: 'javascript', packageName: '@brisabase/js', version: '1.0.0', status: 'published' },
];
