import type { ComponentType } from 'react';

export const useThing = (): string => 'used';
export const Modal: ComponentType = () => null;
export const f = (value: { id: string }): string => value.id;
export const useData = (): string => 'data';
export const WizardField = {
  label: 'field',
  externalDataHook: useData,
};
