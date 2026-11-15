import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useEffect, useRef } from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '@/lib/haptics';
import { colors } from '@/lib/theme';
import { fromScannerResult, type DetectedCode } from '../format';

/** The scan pill is hidden where expo-camera cannot scan (web). */
export const isScannerSupported = Platform.OS !== 'web';

const WINDOW_WIDTH = 280;
const WINDOW_HEIGHT = 160;
const DIM = 'rgba(0,0,0,0.6)';

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  /** First successful scan. The modal does not close itself — the caller hides it. */
  onScanned: (result: DetectedCode) => void;
}

/**
 * Full-screen camera scanner for card barcodes (EAN-13/8, UPC-A, Code128, QR).
 * The first scan fires a success haptic and is reported once (`scannedRef`);
 * later frames are ignored until the modal is reopened.
 */
export function BarcodeScannerModal({ visible, onClose, onScanned }: BarcodeScannerModalProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    scannedRef.current = false;
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const onBarcodeScanned = (result: BarcodeScanningResult) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    haptics.success();
    onScanned(fromScannerResult(result.type, result.data));
  };

  const denied = permission !== null && !permission.granted && !permission.canAskAgain;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <View className="flex-1 bg-background">
        {permission?.granted ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'code128', 'qr'],
              }}
              onBarcodeScanned={visible ? onBarcodeScanned : undefined}
            />
            {/* Dim overlay with a clear centred window and a hairline frame. */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View style={{ flex: 1, backgroundColor: DIM }} />
              <View style={{ flexDirection: 'row', height: WINDOW_HEIGHT }}>
                <View style={{ flex: 1, backgroundColor: DIM }} />
                <View
                  style={{
                    width: WINDOW_WIDTH,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.onSurface,
                    borderRadius: 12,
                  }}
                />
                <View style={{ flex: 1, backgroundColor: DIM }} />
              </View>
              <View
                style={{ flex: 1, backgroundColor: DIM, paddingBottom: insets.bottom + 48 }}
                className="items-center justify-end px-xl">
                <Text className="text-center font-inter text-body-md text-on-surface">
                  Насочи камерата към баркода на картата
                </Text>
              </View>
            </View>
          </>
        ) : denied ? (
          <View className="flex-1 items-center justify-center gap-lg px-xl">
            <MaterialIcons name="no-photography" size={40} color={colors.outline} />
            <Text className="text-center font-jakarta-medium text-headline-md text-on-surface">
              Няма достъп до камерата
            </Text>
            <Pressable
              onPress={() => void Linking.openSettings()}
              accessibilityRole="button"
              className="border border-primary-container px-6 py-2 active:opacity-80"
              style={{ borderRadius: 9999 }}>
              <Text className="font-inter-semibold text-label-md uppercase text-primary-container">
                Отвори настройките
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Затвори"
          className="absolute right-md h-10 w-10 items-center justify-center rounded-full bg-surface-container/70"
          style={{ top: insets.top + 12 }}>
          <MaterialIcons name="close" size={22} color={colors.onSurface} />
        </Pressable>
      </View>
    </Modal>
  );
}
