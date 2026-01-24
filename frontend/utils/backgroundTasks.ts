import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { processOfflineQueue } from './offlineQueue';
import { getQueue } from './db';
import NetInfo from '@react-native-community/netinfo';

const BACKGROUND_SYNC_TASK = 'BACKGROUND_SYNC_TASK';

// 1. Define the Task (Global Scope)
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    console.log(`[Background Fetch] ⏰ Woke up!`);

    // A. Check Internet first to save battery
    const net = await NetInfo.fetch();
    if (!net.isConnected || !net.isInternetReachable) {
        console.log(`[Background Fetch] No internet. Going back to sleep.`);
        return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // B. Check Queue
    const queue = getQueue();
    if (!queue || queue.length === 0) {
      console.log(`[Background Fetch] Queue empty.`);
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    console.log(`[Background Fetch] found ${queue.length} items. Processing...`);

    // C. Run Sync
    await processOfflineQueue();
    
    return BackgroundFetch.BackgroundFetchResult.NewData;
    
  } catch (error) {
    console.error('[Background Fetch] Failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// 2. Register
export async function registerBackgroundFetchAsync() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
        console.log("✅ Background Sync already registered");
        return;
    }

    const status = await BackgroundFetch.getStatusAsync();
    
    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted || 
        status === BackgroundFetch.BackgroundFetchStatus.Denied) {
        console.log("❌ Background fetch denied by OS");
        return;
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 60 * 20, // 20 minutes
      stopOnTerminate: false,   // Android only
      startOnBoot: true,        // Android only
    });
    console.log("✅ Background Sync Registered");
  } catch (err) {
    console.log("Task Register failed:", err);
  }
}

export async function unregisterBackgroundFetchAsync() {
  return BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
}