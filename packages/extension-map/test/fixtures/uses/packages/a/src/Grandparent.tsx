import React from 'react';
import { Parent } from './Parent';

/** Renders the parent: two hops up, which is never recorded. */
export const Grandparent = (): React.ReactElement => <Parent />;
