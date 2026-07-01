import AsyncStorage from '@react-native-async-storage/async-storage';

export function markerKey(
  householdId: string,
  categoryId: string,
  month: string,
  threshold: 80 | 100,
): string {
  return `budgetAlert:${householdId}:${categoryId}:${month}:${threshold}`;
}

export async function hasAlerted(key: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key)) !== null;
  } catch {
    return false;
  }
}

export async function recordAlerted(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, '1');
  } catch {
    // best-effort; a missed marker only risks one duplicate notification
  }
}
