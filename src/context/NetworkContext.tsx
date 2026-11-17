import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { offlineDB, type SyncQueueItem } from '../offline/db.ts';
import { runPendingSync, type SyncRunSummary } from '../offline/syncService.ts';
import { useAuth } from './AuthContext.tsx';

interface NetworkContextValue {
  isOnline: boolean;
  pendingCount: number;
  conflictItems: SyncQueueItem[];
  isSyncing: boolean;
  lastSyncSummary: SyncRunSummary | null;
  syncNow: () => Promise<SyncRunSummary | null>;
  refreshQueueState: () => Promise<void>;
  dismissConflict: (id: number) => Promise<void>;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isOnline = useOnlineStatus();
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictItems, setConflictItems] = useState<SyncQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncSummary, setLastSyncSummary] = useState<SyncRunSummary | null>(null);

  const refreshQueueState = useCallback(async () => {
    const all = await offlineDB.syncQueue.toArray();
    setPendingCount(all.filter((i) => i.status === 'pending' || i.status === 'error').length);
    setConflictItems(all.filter((i) => i.status === 'conflict'));
  }, []);

  const syncNow = useCallback(async (): Promise<SyncRunSummary | null> => {
    if (!isOnline || !user || isSyncing) return null;
    setIsSyncing(true);
    try {
      const summary = await runPendingSync();
      setLastSyncSummary(summary);
      await refreshQueueState();
      return summary;
    } catch {
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, refreshQueueState, user]);

  const dismissConflict = useCallback(
    async (id: number) => {
      await offlineDB.syncQueue.delete(id);
      await refreshQueueState();
    },
    [refreshQueueState]
  );

  useEffect(() => {
    void refreshQueueState();
  }, [refreshQueueState]);

  // Automatically synchronize pending offline transactions when internet returns
  useEffect(() => {
    if (isOnline && user && pendingCount > 0) {
      void syncNow();
    }
  }, [isOnline, pendingCount, syncNow, user]);

  return (
    <NetworkContext.Provider
      value={{
        isOnline,
        pendingCount,
        conflictItems,
        isSyncing,
        lastSyncSummary,
        syncNow,
        refreshQueueState,
        dismissConflict,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
};

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetwork must be used inside NetworkProvider');
  return ctx;
}
