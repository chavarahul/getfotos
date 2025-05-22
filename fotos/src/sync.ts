import { syncPendingOperations } from '@/lib/db';

export const setupSync = () => {
  const handleOnline = () => {
    syncPendingOperations();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('load', () => {
    if (navigator.onLine) {
      syncPendingOperations();
    }
  });

  return () => {
    window.removeEventListener('online', handleOnline);
  };
};