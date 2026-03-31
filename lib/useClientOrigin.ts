import { useSyncExternalStore } from 'react';

const subscribeToNothing = () => () => {};

export const useClientOrigin = () =>
  useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => '',
  );
