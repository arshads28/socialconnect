import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { processOfflineQueue } from './offlineQueue';
import { getQueue } from './db';

const BACKGROUND_SYNC_TASK = 'BACKGROUND_SYNC_TASK';

// 1. Define the Task (Must be in global scope)
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    const queue = getQueue();
    console.log(`[Background Fetch] Woke up! Pending items: ${queue.length}`);

    if (queue.length > 0) {
      // Run the sync logic we wrote earlier
      await processOfflineQueue();
      
      // Tell OS: "We did work, and we have new data"
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } else {
      // Tell OS: "Nothing to do, go back to sleep"
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
  } catch (error) {
    console.error('[Background Fetch] Failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// 2. Register Function (Call this when App starts)
export async function registerBackgroundFetchAsync() {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    
    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted || 
        status === BackgroundFetch.BackgroundFetchStatus.Denied) {
        console.log("Background fetch denied");
        return;
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 60 * 20, // 15 minutes (Minimum allowed by iOS)
      stopOnTerminate: false,   // Android: Keep working even if app killed
      startOnBoot: true,        // Android: Restart on phone reboot
    });
    console.log("✅ Background Sync Registered");
  } catch (err) {
    console.log("Task Register failed:", err);
  }
}

// 3. Unregister (Optional, for debugging)
export async function unregisterBackgroundFetchAsync() {
  return BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
}