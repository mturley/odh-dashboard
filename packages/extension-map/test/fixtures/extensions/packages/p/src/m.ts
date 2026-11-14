export type D = { id: string };

export const useThing = (): number => 1;

export const Modal = (): string => 'modal';

export const f = (d: D): string => d.id;

const main = (): string => 'main';

export default main;
