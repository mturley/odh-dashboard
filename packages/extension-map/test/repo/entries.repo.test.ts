import { diag, entriesOf, pkg, staticEntryPkgs } from './model';
import { docPathFor } from '../../src/render/links';

describe('entries in the real repo', () => {
  it('model-serving has static and federated entries', () => {
    expect(
      entriesOf('@odh-dashboard/model-serving')
        .map((e) => e.path)
        .toSorted(),
    ).toEqual(['federated', 'static']);
  });

  it('the host never loads model-serving or observability as remotes', () => {
    expect(diag('federation-not-loaded', '@odh-dashboard/model-serving')).toBeDefined();
    expect(diag('federation-not-loaded', '@odh-dashboard/observability')).toBeDefined();
  });

  it('maas and gen-ai expose a distribution-static entry', () => {
    expect(entriesOf('@odh-dashboard/maas').map((e) => e.path)).toContain('distribution-static');
    expect(entriesOf('@odh-dashboard/gen-ai').map((e) => e.path)).toContain('distribution-static');
  });

  it('finds 15 static ./extensions entries, the core app among them', () => {
    expect(staticEntryPkgs()).toHaveLength(15);
    expect(staticEntryPkgs()).toContain('@odh-dashboard/internal');
  });

  it('writes the core app page to frontend/docs', () => {
    expect(docPathFor(pkg('@odh-dashboard/internal'))).toBe('frontend/docs/extensions.md');
  });
});
