import { writeFileAtomically } from '@/distribution/atomicFile';

export async function writeServiceFileAtomically(path: string, content: string): Promise<void> {
  await writeFileAtomically(path, content, { mode: 0o600 });
}
