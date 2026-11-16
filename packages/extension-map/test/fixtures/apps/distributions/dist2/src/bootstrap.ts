import { loadRemote } from '@module-federation/runtime';

export const start = async (name: string): Promise<void> => {
  await loadRemote('rem/extensions');
  await loadRemote(`${name}/extensions`);
};
