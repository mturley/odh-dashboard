import { renderPackagePage } from './packagePage';
import type { GeneratedFile } from './packagePage';
import type { ExtensionMapModel } from '../model/types';

export const renderAll = (model: ExtensionMapModel): GeneratedFile[] => {
  const packages = model.packages.filter(
    (pkg) =>
      model.points.some((point) => point.pkg === pkg.name) ||
      model.extensions.some((extension) => extension.pkg === pkg.name) ||
      model.consumers.some((consumer) => consumer.pkg === pkg.name),
  );
  return packages
    .map((pkg) => renderPackagePage(model, pkg))
    .toSorted((a, b) => a.path.localeCompare(b.path));
};
