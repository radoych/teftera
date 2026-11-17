import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { FlatInput } from '@/components/FlatInput';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { initials } from '@/lib/initials';

interface ProfileHeaderProps {
  displayName: string;
  email: string;
  onSaveName: (name: string) => Promise<void>;
}

/**
 * Avatar/name/email row plus the "Редакция" edit sheet. Owns the sheet's
 * open/draft/saving state and the save UX (error alert on failure); the
 * actual persistence is delegated to the injected `onSaveName`.
 */
export function ProfileHeader({ displayName, email, onSaveName }: ProfileHeaderProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  const avatarInitials = initials(displayName);

  const handleSaveName = async () => {
    const name = nameDraft.trim();
    if (!name || savingName) return;
    setSavingName(true);
    try {
      await onSaveName(name);
      setEditOpen(false);
    } catch {
      Alert.alert('Грешка', 'Името не можа да бъде записано. Опитай отново.');
    } finally {
      setSavingName(false);
    }
  };

  return (
    <>
      <View className="flex-row items-center justify-between gap-md">
        <View className="flex-1 flex-row items-center gap-md">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-container">
            <Text className="font-jakarta-semibold text-headline-md text-on-primary">
              {avatarInitials}
            </Text>
          </View>
          <View className="flex-1">
            <Text
              numberOfLines={1}
              className="font-jakarta-semibold text-headline-md text-on-surface"
            >
              {displayName}
            </Text>
            <Text
              numberOfLines={1}
              className="font-inter text-body-md text-on-surface-variant opacity-70"
            >
              {email}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => {
            setNameDraft(displayName);
            setEditOpen(true);
          }}
          className="shrink-0 rounded-full border border-primary-container px-6 py-2 active:bg-primary-container/10">
          <Text className="font-inter text-label-md text-primary-container">
            Редакция
          </Text>
        </Pressable>
      </View>

      <BottomSheet visible={editOpen} onClose={() => setEditOpen(false)}>
        <View className="gap-lg px-6 pb-4 pt-2">
          <Text className="font-jakarta-semibold text-headline-md text-on-surface">
            Редакция на профила
          </Text>
          <FlatInput
            value={nameDraft}
            onChangeText={setNameDraft}
            placeholder="Име"
            autoCapitalize="words"
          />
          <FloatingActionBar inline
            actions={[
              {
                label: 'Запази', icon: 'check',
                onPress: handleSaveName,
                variant: 'filled',
                loading: savingName,
                disabled: nameDraft.trim() === '',
              },
              { label: 'Отказ', icon: 'close', onPress: () => setEditOpen(false), variant: 'ghost' },
            ]}
          />
        </View>
      </BottomSheet>
    </>
  );
}
