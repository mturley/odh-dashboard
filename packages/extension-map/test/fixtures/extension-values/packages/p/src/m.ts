import type { ComponentType } from 'react';

export const useThing = (): string => 'used';
export const Modal: ComponentType = () => null;
export const f = (value: { id: string }): string => value.id;
export const useData = (): string => 'data';
const dynamicSupplies = (): Record<string, unknown> => ({ externalDataHook: useThing });

export const WizardField = {
  label: 'field',
  externalDataHook: useData,
};

export const SpreadField = {
  externalDataHook: useData,
  ...dynamicSupplies(),
  label: 'after-spread',
};
