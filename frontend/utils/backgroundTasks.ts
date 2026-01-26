import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import NetInfo from '@react-native-community/netinfo';

// Imports from your utils
import { processOfflineQueue } from './offlineQueue';
import { getQueue } from './db';
import { syncPendingMessages, resendStuckMessages } from './sync'; // ✅ Import these

const BACKGROUND_SYNC_TASK = 'BACKGROUND_SYNC_TASK';

// 1. Define the Task
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  const now = new Date();
  console.log(`[Background Fetch] ⏰ Woke up at ${now.toISOString()}`);

  try {
    // A. Battery/Data Save: Check Internet First
    const net = await NetInfo.fetch();
    if (!net.isConnected || !net.isInternetReachable) {
        console.log(`[Background Fetch] 📴 No internet. Sleeping.`);
        return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    let hasData = false;

    // B. Maintenance: Re-queue stuck messages (older than 2 mins)
    // This ensures failed sends get a second chance
    await resendStuckMessages();

    // C. Outgoing: Process the Queue (Sends messages, deletes, etc.)
    const queue = getQueue();
    if (queue && queue.length > 0) {
        console.log(`[Background Fetch] 📤 Processing ${queue.length} outgoing items...`);
        await processOfflineQueue();
        hasData = true;
    }

    console.log(`[Background Fetch] 📥 Checking for new messages...`);
    await syncPendingMessages();
    

    return hasData 
        ? BackgroundFetch.BackgroundFetchResult.NewData 
        : BackgroundFetch.BackgroundFetchResult.NoData;

  } catch (error) {
    console.error('[Background Fetch] ❌ Failed:', error);
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

    // Register with OS
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 60 * 15, // 15 minutes (iOS minimum limit)
      stopOnTerminate: false,   // Android only (continue after kill)
      startOnBoot: true,        // Android only (start after reboot)
    });
    console.log("✅ Background Sync Registered");
  } catch (err) {
    console.log("Task Register failed:", err);
  }
}

export async function unregisterBackgroundFetchAsync() {
  return BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
}