import { MaterialIcons } from '@expo/vector-icons';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import DocumentScanner from 'react-native-document-scanner-plugin';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { PillButton } from '@/components/PillButton';
import { useAuthStore } from '@/features/auth/store';
import { uploadReceipt } from '@/features/receipts/storage';

type Phase = 'scanning' | 'uploading' | 'error' | 'no-household';

/** Thin launcher around the native document scanner: auto-capture → compress →
 *  upload → confirm screen. The capture UI is OS-native; this screen only shows
 *  branded loading / error states. */
export default function ScannerScreen() {
  const [phase, setPhase] = useState<Phase>('scanning');
  const started = useRef(false);

  const run = useCallback(async () => {
    const householdId = useAuthStore.getState().householdId;
    if (!householdId) {
      setPhase('no-household');
      return;
    }
    setPhase('scanning');
    try {
      const { scannedImages, status } = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
      });
      if (status !== 'success' || !scannedImages?.length) {
        router.back();
        return;
      }
      setPhase('uploading');
      const shrunk = await manipulateAsync(scannedImages[0]!, [{ resize: { width: 1600 } }], {
        compress: 0.7,
        format: SaveFormat.JPEG,
      });
      const { storagePath } = await uploadReceipt(shrunk.uri, householdId);
      router.replace({
        pathname: '/confirm-receipt',
        params: { storagePath, previewUri: shrunk.uri },
      });
    } catch (err) {
      if (__DEV__) console.warn('[scanner] capture/upload failed', err);
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, [run]);

  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1 items-center justify-center px-xl">
        {phase === 'uploading' && (
          <View className="items-center gap-lg">
            <ActivityIndicator size="large" color="#adc7ff" />
            <Text className="font-inter text-body-lg text-on-surface">Качване на бележка…</Text>
          </View>
        )}

        {phase === 'scanning' && <ActivityIndicator size="large" color="#adc7ff" />}

        {phase === 'no-household' && (
          <View className="items-center gap-lg">
            <MaterialIcons name="error-outline" size={48} color="#ffb4ab" />
            <Text className="text-center font-inter text-body-lg text-on-surface">
              Няма активно домакинство.
            </Text>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text className="font-inter text-label-md text-on-surface-variant">Назад</Text>
            </Pressable>
          </View>
        )}

        {phase === 'error' && (
          <View className="w-full items-center gap-lg">
            <MaterialIcons name="cloud-off" size={48} color="#ffb4ab" />
            <Text className="text-center font-inter text-body-lg text-on-surface">
              Качването не успя. Опитай отново.
            </Text>
            <View className="w-full max-w-xs flex-row gap-md">
              <View className="flex-1">
                <PillButton label="Назад" variant="ghost" uppercase block onPress={() => router.back()} />
              </View>
              <View className="flex-1">
                <PillButton label="Опитай пак" variant="filled" uppercase block onPress={run} />
              </View>
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}
