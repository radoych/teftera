// features/budgets/notify.ts — the ONLY module that touches expo-notifications.
import * as Notifications from 'expo-notifications';

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

export async function sendBudgetNotification(input: { title: string; body: string }): Promise<void> {
  try {
    const granted = await ensureNotificationPermission();
    if (!granted) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: input.title, body: input.body },
      trigger: null, // immediate
    });
  } catch (err) {
    if (__DEV__) console.warn('[budgets] notify failed', err);
  }
}
