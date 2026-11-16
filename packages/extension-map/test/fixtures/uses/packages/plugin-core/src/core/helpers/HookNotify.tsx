import React from 'react';

/** Like plugin-core's own: runs a hook and reports its value. */
export const HookNotify = <V,>({
  useHook,
  onNotify,
}: {
  useHook: () => V;
  onNotify?: (value: V) => void;
}): null => {
  const value = useHook();
  React.useEffect(() => {
    onNotify?.(value);
  }, [value, onNotify]);
  return null;
};
