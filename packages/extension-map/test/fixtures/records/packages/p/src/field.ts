import type { FxFieldType } from './points';

export const useData = (): number => 1;

export const myField = {
  id: 'f1',
  label: 'Field',
  externalDataHook: useData,
} satisfies FxFieldType;
