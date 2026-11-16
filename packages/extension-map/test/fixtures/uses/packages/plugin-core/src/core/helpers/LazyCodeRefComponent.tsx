import React from 'react';

type LazyCodeRefComponentProps = {
  component: () => Promise<React.ComponentType | { default: React.ComponentType }>;
};

/** Like plugin-core's own: renders the component a code reference resolves to. */
export function LazyCodeRefComponent({ component }: LazyCodeRefComponentProps): React.ReactElement {
  const Lazy = React.useMemo(
    () =>
      React.lazy(() =>
        component().then((module) => ('default' in module ? module : { default: module })),
      ),
    [component],
  );
  return (
    <React.Suspense>
      <Lazy />
    </React.Suspense>
  );
}
