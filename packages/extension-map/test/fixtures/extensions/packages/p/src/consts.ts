export const ROUTE_BASE = '/fx/routes';

const computeNames = (): string[] => ['one', 'two'];

/** Not an array literal, so the walk cannot count what a `.map()` over it produces. */
export const NAMES = computeNames();

/** Not an array literal, so the flag list it stands for cannot be read. */
export const DISALLOWED_FLAGS = computeNames();
