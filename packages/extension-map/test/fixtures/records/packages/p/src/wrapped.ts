import type { FxWrappedExtension } from './points';

type Schema = { parse: (input: unknown) => string };

const makeSchema = (): Schema => ({ parse: (input) => String(input) });

const makeLabel = (parts: { text: string }): string => parts.text;

/** Code rather than data: the walk names it instead of reading it. */
const wrappedSchema = makeSchema();

/** Data the walk cannot read, because a call computes it. */
const computedPath = ['fx', 'wrapped'].join('/');

export const wrappedExtension = {
  type: 'fx.wrapped',
  properties: {
    schema: wrappedSchema,
    route: computedPath,
    label: makeLabel({ text: 'Wrapped' }),
  },
} satisfies FxWrappedExtension;
