// features/budgets/notify.ts — the ONLY module that touches expo-notifications.
// (Anomaly alerts import the generic sender from here too, preserving that invariant.)
//
// expo-notifications is loaded lazily (not a top-level import): in Expo Go
// (SDK 53+) the module throws during evaluation because notification support was
// removed from Expo Go. A top-level import would therefore crash any screen that
// transitively imports this file (manual-entry, confirm-receipt via
// runBudgetCheck). Requiring it inside the try/catch below defers that throw to
// call time, where it degrades to "notifications unavailable". Real delivery
// needs a development/preview build.
type NotificationsModule = typeof import('expo-notifications');

function loadNotifications(): NotificationsModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications') as NotificationsModule;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const Notifications = loadNotifications();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

/** Fire an immediate local notification (permission-aware, never throws). */
export async function sendLocalNotification(input: { title: string; body: string }): Promise<void> {
  try {
    const granted = await ensureNotificationPermission();
    if (!granted) return;
    const Notifications = loadNotifications();
    await Notifications.scheduleNotificationAsync({
      content: { title: input.title, body: input.body },
      trigger: null, // immediate
    });
  } catch (err) {
    if (__DEV__) console.warn('[notify] failed', err);
  }
}

export async function sendBudgetNotification(input: { title: string; body: string }): Promise<void> {
  await sendLocalNotification(input);
}
