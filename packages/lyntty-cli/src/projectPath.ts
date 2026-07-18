import { runtimeLayout } from './distribution/runtimeLayout';

export function projectPath(): string {
    return runtimeLayout().libraryDir;
}
