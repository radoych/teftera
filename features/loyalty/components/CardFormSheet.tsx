import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Barcode } from '@/components/Barcode';
import { BottomSheet } from '@/components/BottomSheet';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FlatInput } from '@/components/FlatInput';
import { SectionLabel } from '@/components/SectionLabel';
import { SegmentedToggle } from '@/components/SegmentedToggle';
import { SheetActions, type SheetAction } from '@/components/SheetActions';
import { useAuthStore } from '@/features/auth/store';
import { createVendor } from '@/features/vendors/api';
import { VendorAutocomplete } from '@/features/vendors/components/VendorAutocomplete';
import { ensureVendorForMerchant } from '@/features/vendors/ensure';
import { getVendorIndex } from '@/features/vendors/store';
import { refreshVendors } from '@/features/vendors/sync';
import { COLOR_CHOICES } from '@/lib/palette';
import { colors } from '@/lib/theme';
import { createCard, deleteCard, updateCard } from '../api';
import { formatGroup, initialFormatChoice, resolveDraftCode, type FormatGroup } from '../format';
import { isNicknameTakenError } from '../rows';
import { refreshLoyaltyCards, useCardCount } from '../sync';
import type { LoyaltyCard } from '../types';
import { initialVendorText, resolveCardVendorId } from '../vendorField';
import { BarcodeScannerModal, isScannerSupported } from './BarcodeScannerModal';

const NICKNAME_TAKEN = 'Вече има карта с този прякор за този търговец.';
const DEFAULT_COLOR = COLOR_CHOICES[2] ?? colors.primaryContainer;

export interface CardFormSheetProps {
  visible: boolean;
  /** The card to edit; null / omitted = create a new card. */
  card?: LoyaltyCard | null;
  /** Vendor preselected when creating (e.g. from a vendor screen). */
  initialVendorId?: string | null;
  onClose: () => void;
  /** After a successful save (store already refreshed). */
  onSaved?: (cardId: string) => void;
  /** After a successful delete (store already refreshed). */
  onDeleted?: (cardId: string) => void;
}

/**
 * Add / edit a loyalty card in a bottom sheet: vendor (autocomplete; a new
 * name creates the vendor, blank = "Без търговец"), nickname, code
 * (+ camera scan), format, colour, note, a live barcode preview, and
 * [Запази][Отказ] (+ [Изтрий] when editing).
 */
export function CardFormSheet(props: CardFormSheetProps) {
  return (
    <BottomSheet visible={props.visible} onClose={props.onClose}>
      {/* Mounted only while open, so every open starts from a fresh draft. */}
      <CardForm {...props} />
    </BottomSheet>
  );
}

const FORMAT_OPTIONS: { value: FormatGroup; label: string }[] = [
  { value: 'ean', label: 'EAN' },
  { value: 'code128', label: 'Code128' },
  { value: 'qr', label: 'QR' },
];

function CardForm({
  card,
  initialVendorId = null,
  onClose,
  onSaved,
  onDeleted,
}: CardFormSheetProps) {
  const { height } = useWindowDimensions();
  const householdId = useAuthStore((s) => s.householdId);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const displayName = useAuthStore((s) => s.displayName);
  const editing = card ?? null;

  const cardCount = useCardCount();
  const startVendorId = editing ? editing.vendor_id : initialVendorId;
  // Snapshot at open: an untouched field keeps `startVendorId` even if its name is not loaded.
  const [startVendorText] = useState(() => initialVendorText(startVendorId, getVendorIndex()));
  const [vendorText, setVendorText] = useState(startVendorText);
  const [nickname, setNickname] = useState(editing?.nickname ?? displayName ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  /** null = not picked by the user → auto-detected from the code. */
  const [formatChoice, setFormatChoice] = useState<FormatGroup | null>(
    editing ? initialFormatChoice(editing.code, editing.code_format) : null,
  );
  const [color, setColor] = useState(editing?.color ?? DEFAULT_COLOR);
  const [note, setNote] = useState(editing?.note ?? '');
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const resolved = resolveDraftCode(code, formatChoice);
  const group = formatChoice ?? formatGroup(resolved.format);
  const canSave = nickname.trim() !== '' && resolved.code !== '' && !!householdId;

  const onSave = async () => {
    if (!canSave || saving || !householdId) return;
    setSaving(true);
    setNicknameError(null);
    try {
      // A newly typed vendor name creates the vendor (spec §7.6); blank = orphan card.
      const finalVendorId = await resolveCardVendorId(
        {
          householdId,
          text: vendorText,
          initialText: startVendorText,
          initialVendorId: startVendorId,
          index: getVendorIndex(),
        },
        {
          ensure: (args) =>
            ensureVendorForMerchant(args, { createVendor, refreshVendors, getIndex: getVendorIndex }),
          refreshVendors,
        },
      );
      const fields = {
        vendorId: finalVendorId,
        nickname: nickname.trim(),
        code: resolved.code,
        codeFormat: resolved.format,
        color,
        note: note.trim() === '' ? null : note.trim(),
      };
      let id: string;
      if (editing) {
        await updateCard(editing.id, fields);
        id = editing.id;
      } else {
        ({ id } = await createCard({ ...fields, householdId, createdBy: userId }));
      }
      await refreshLoyaltyCards(householdId);
      onSaved?.(id);
      onClose();
    } catch (err) {
      if (isNicknameTakenError(err)) setNicknameError(NICKNAME_TAKEN);
      else Alert.alert('Грешка', 'Картата не можа да бъде записана. Опитай отново.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!editing || deleting || !householdId) return;
    setDeleting(true);
    try {
      await deleteCard(editing.id);
      await refreshLoyaltyCards(householdId);
      setConfirmDelete(false);
      onDeleted?.(editing.id);
      onClose();
    } catch {
      Alert.alert('Грешка', 'Картата не можа да бъде изтрита. Опитай отново.');
    } finally {
      setDeleting(false);
    }
  };

  const actions: SheetAction[] = [
    { label: 'Запази', onPress: onSave, variant: 'filled', loading: saving, disabled: !canSave },
    { label: 'Отказ', onPress: onClose, variant: 'ghost' },
  ];
  if (editing) {
    actions.push({ label: 'Изтрий', onPress: () => setConfirmDelete(true), variant: 'destructive' });
  }

  return (
    <View style={{ maxHeight: height * 0.85 }}>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-lg px-6 pb-4 pt-2">
        <Text className="font-jakarta-semibold text-headline-md text-on-surface">
          {editing ? 'Редакция на карта' : 'Нова карта'}
        </Text>

        <View>
          <SectionLabel className="mb-xs">Търговец</SectionLabel>
          {/* Bottom rule matches FlatInput (white at 10%). */}
          <View className="border-b border-white/10 py-sm">
            <VendorAutocomplete
              variant="field"
              value={vendorText}
              onChangeText={setVendorText}
              placeholder="Без търговец"
              cardCount={cardCount}
            />
          </View>
        </View>

        <View>
          <SectionLabel className="mb-xs">Прякор</SectionLabel>
          <FlatInput
            value={nickname}
            onChangeText={(text) => {
              setNickname(text);
              setNicknameError(null);
            }}
            placeholder="Чия е картата"
            autoCapitalize="sentences"
          />
          {nicknameError ? (
            <Text className="mt-xs font-inter text-body-md text-error">{nicknameError}</Text>
          ) : null}
        </View>

        <View>
          <SectionLabel className="mb-xs">Код</SectionLabel>
          <View className="flex-row items-center gap-md">
            <View className="flex-1">
              <FlatInput
                value={code}
                onChangeText={setCode}
                placeholder="Номер на картата"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={group === 'ean' ? 'number-pad' : 'default'}
              />
            </View>
            {isScannerSupported ? (
              <Pressable
                onPress={() => setScanning(true)}
                accessibilityRole="button"
                className="flex-row items-center gap-xs border border-white/10 px-4 py-2 active:bg-white/5"
                style={{ borderRadius: 9999 }}>
                <MaterialIcons name="qr-code-scanner" size={16} color={colors.onSurface} />
                <Text className="font-inter-semibold text-label-md uppercase text-on-surface">
                  Сканирай
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View>
          <SectionLabel className="mb-sm">Формат</SectionLabel>
          <View className="items-start">
            <SegmentedToggle<FormatGroup>
              value={group}
              onChange={setFormatChoice}
              options={FORMAT_OPTIONS}
            />
          </View>
        </View>

        <View>
          <SectionLabel className="mb-md">Цвят</SectionLabel>
          <View className="flex-row flex-wrap gap-sm">
            {COLOR_CHOICES.map((c) => {
              const active = color === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className="h-11 w-11 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: c,
                    borderWidth: active ? 3 : 0,
                    borderColor: colors.onSurface,
                  }}>
                  {active ? (
                    <MaterialIcons name="check" size={18} color={colors.background} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <SectionLabel className="mb-xs">Бележка</SectionLabel>
          <FlatInput
            value={note}
            onChangeText={setNote}
            placeholder="По желание"
            autoCapitalize="sentences"
          />
        </View>

        {resolved.code !== '' ? <Barcode value={resolved.code} format={resolved.format} /> : null}

        <SheetActions actions={actions} />
      </KeyboardAwareScrollView>

      {/* Nested inside the sheet's Modal so iOS presents them from it. */}
      <BarcodeScannerModal
        visible={scanning}
        onClose={() => setScanning(false)}
        onScanned={(result) => {
          setCode(result.code);
          // Trust the scanner's symbology; stay on auto when detection agrees.
          setFormatChoice(initialFormatChoice(result.code, result.format));
          setScanning(false);
        }}
      />
      <ConfirmSheet
        visible={confirmDelete}
        title={`Изтриване на картата „${editing?.nickname ?? ''}"?`}
        message="Списъците, които я използват, остават без карта."
        confirmLabel={deleting ? 'Изтриване…' : 'Изтрий'}
        destructive
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  );
}
