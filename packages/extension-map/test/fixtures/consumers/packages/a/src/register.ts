import type { Extension } from '@openshift/dynamic-plugin-sdk';
import { isA } from './points';

const registry: ((e: Extension) => boolean)[] = [];

const registerSomething = (guard: (e: Extension) => boolean): void => {
  registry.push(guard);
};

registerSomething(isA);

export const isItA = (e: Extension): boolean => e.type === 'fx.a';
