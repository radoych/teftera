import { Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { SectionLayoutEditor } from '@/features/preferences/components/SectionLayoutEditor';
import type { UserPreferences } from '@/features/preferences/types';

interface LayoutSheetProps {
  visible: boolean;
  sections: UserPreferences['dashboardSections'];
  onChange: (next: UserPreferences['dashboardSections']) => Promise<void>;
  onClose: () => void;
}

export function LayoutSheet({ visible, sections, onChange, onClose }: LayoutSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="px-6 pb-1 pt-1 font-jakarta-semibold text-headline-md text-on-surface">
        Подреждане на началния екран
      </Text>
      <Text className="px-6 pb-3 font-inter text-body-md text-on-surface-variant opacity-70">
        Влачи дръжката, за да подредиш. Превключи Вкл/Изкл, за да скриеш.
      </Text>
      {/* Extra bottom padding lifts the rows above the Android home-gesture
          zone so the last item can be dragged up without triggering it. */}
      <View className="px-6 pb-16">
        <SectionLayoutEditor sections={sections} onChange={onChange} />
      </View>
    </BottomSheet>
  );
}
