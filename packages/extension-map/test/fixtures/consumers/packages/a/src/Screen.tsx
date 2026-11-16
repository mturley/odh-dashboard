import React from 'react';
import { Loader } from './Loader';
import { isA } from './points';

export const Screen = (): React.ReactElement => <Loader predicate={isA} label="a" />;
