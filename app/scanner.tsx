import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PillButton } from '@/components/PillButton';

/** Camera capture for receipts. Capture/gallery route to the confirm screen,
 *  where Gemini extraction is reviewed (and where parsing failures fall back). */
export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const capture = async () => {
    try {
      await cameraRef.current?.takePictureAsync({ quality: 0.7, base64: false });
    } catch {
      // Ignore capture errors in this static slice.
    }
    router.replace('/confirm-receipt');
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (!result.canceled) {
      router.replace('/confirm-receipt');
    }
  };

  // Permission gate.
  if (!permission) {
    return <View className="flex-1 bg-black" />;
  }
  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-lg bg-black px-xl">
        <MaterialIcons name="photo-camera" size={48} color="#adc7ff" />
        <Text className="text-center font-inter text-body-lg text-on-surface">
          Нужен е достъп до камерата, за да сканираш бележки.
        </Text>
        <PillButton label="Разреши достъп" onPress={requestPermission} />
        <Pressable onPress={() => router.back()}>
          <Text className="font-inter text-label-md text-on-surface-variant">Назад</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" enableTorch={torch} />

      {/* Viewfinder brackets overlay */}
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="aspect-[2/3.5] w-[70%] max-w-[320px]">
          <View className="absolute left-0 top-0 h-6 w-6 rounded-tl-lg border-l-2 border-t-2 border-white/80" />
          <View className="absolute right-0 top-0 h-6 w-6 rounded-tr-lg border-r-2 border-t-2 border-white/80" />
          <View className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-lg border-b-2 border-l-2 border-white/80" />
          <View className="absolute bottom-0 right-0 h-6 w-6 rounded-br-lg border-b-2 border-r-2 border-white/80" />
        </View>
      </View>

      {/* UI layer */}
      <SafeAreaView className="absolute inset-0 justify-between">
        {/* Top bar */}
        <View className="px-6 pt-md">
          <Pressable
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-highest/40 active:scale-90">
            <MaterialIcons name="close" size={24} color="#e3e2e6" />
          </Pressable>
        </View>

        {/* Bottom controls */}
        <View className="items-center px-6 pb-xxl">
          <Text className="mb-xl font-inter text-body-md text-white opacity-90">
            Подравни бележката в рамката
          </Text>
          <View className="w-full max-w-sm flex-row items-center justify-between">
            <Pressable
              onPress={() => setTorch((t) => !t)}
              className={`h-12 w-12 items-center justify-center rounded-full border border-white/20 ${torch ? 'bg-primary-container' : 'bg-white/5'}`}>
              <MaterialIcons name="bolt" size={24} color={torch ? '#112f5e' : '#ffffff'} />
            </Pressable>

            <Pressable
              onPress={capture}
              className="h-20 w-20 items-center justify-center active:scale-95">
              <View className="absolute inset-0 rounded-full border-4 border-primary-container" />
              <View className="h-[60px] w-[60px] rounded-full bg-white" />
            </Pressable>

            <Pressable
              onPress={pickFromGallery}
              className="h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5">
              <MaterialIcons name="photo-library" size={24} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
