import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';

const loaderDir = dirname(fileURLToPath(import.meta.url));
const testDistRoot = pathResolve(loaderDir, '../.test-dist');

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith('$lib/')) {
    const target = pathResolve(testDistRoot, 'src/lib', `${specifier.slice(5)}.js`);
    return {
      url: pathToFileURL(target).href,
      shortCircuit: true
    };
  }

  return defaultResolve(specifier, context, defaultResolve);
}
