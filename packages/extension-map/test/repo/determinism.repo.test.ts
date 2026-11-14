import { getRepoModel } from './model';
import { analyzeRepo } from '../../src/analyze';
import { renderAll } from '../../src/render/renderAll';
import { findRepoRoot } from '../../src/repoRoot';

const repoRoot = findRepoRoot();

describe('determinism', () => {
  it('renders byte-identical output from a second analysis', () => {
    expect(renderAll(analyzeRepo({ repoRoot }))).toEqual(renderAll(getRepoModel()));
  });

  it('builds the same model with the source cache off', () => {
    expect(analyzeRepo({ repoRoot, sourceCache: false })).toEqual(getRepoModel());
  });
});
