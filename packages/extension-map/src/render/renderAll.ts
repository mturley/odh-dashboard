import { renderPackagePage } from './packagePage';
import type { GeneratedFile } from './packagePage';
import type { ExtensionMapModel, Pkg } from '../model/types';

/**
 * A package gets a page when it defines an extension point, contributes an extension, or has code
 * that queries or uses one (every consumer has at least one query or use site).
 */
const hasPage = (model: ExtensionMapModel, pkg: Pkg): boolean =>
  model.points.some((point) => point.pkg === pkg.name) ||
  model.extensions.some((record) => record.pkg === pkg.name) ||
  model.consumers.some((consumer) => consumer.pkg === pkg.name);

/** Every generated file, sorted by path. */
export const renderAll = (model: ExtensionMapModel): GeneratedFile[] => {
  const files = model.packages
    .filter((pkg) => hasPage(model, pkg))
    .map((pkg) => renderPackagePage(model, pkg))
    .toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const seen = new Set<string>();
  files.forEach((file) => {
    if (seen.has(file.path)) {
      throw new Error(`Two packages would generate the same page: ${file.path}`);
    }
    seen.add(file.path);
  });
  return files;
};
