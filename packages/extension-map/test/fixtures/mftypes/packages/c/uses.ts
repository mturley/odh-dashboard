import { isRemP } from '@mf/rem/extension-points';
import type { RemData } from '@mf/rem/extension-points';
import { isRemP as isRemPFromSource } from '../rem/frontend/src/odh/extension-points/p';
import type { RemData as RemDataFromSource } from '../rem/frontend/src/odh/extension-points/p';

export const guards = [isRemP, isRemPFromSource];

export const data: [RemData, RemDataFromSource] = [{ id: 'a' }, { id: 'b' }];
