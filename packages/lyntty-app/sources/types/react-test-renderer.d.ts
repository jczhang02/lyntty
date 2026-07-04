declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export function create(element: ReactElement): unknown;
  export function act<T>(callback: () => T | Promise<T>): Promise<T>;
}
