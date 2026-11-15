import { Text, View } from 'react-native';
import { HairlineDivider } from '@/components/HairlineDivider';
import { SectionLabel } from '@/components/SectionLabel';

/** Counts shown after an import. */
export interface ImportSummary {
  imported: number;
  duplicates: number;
  other: number;
}

export function ImportSummaryView({ summary }: { summary: ImportSummary }) {
  return (
    <>
      <SectionLabel className="mb-lg">Резултат от импорта</SectionLabel>
      <View className="gap-4">
        <View className="flex-row items-center justify-between py-md">
          <Text className="font-inter text-body-lg text-on-surface">Импортирани</Text>
          <Text className="font-inter-semibold text-body-lg text-on-surface">{summary.imported}</Text>
        </View>
        <HairlineDivider />
        <View className="flex-row items-center justify-between py-md">
          <Text className="font-inter text-body-lg text-on-surface-variant opacity-70">
            Пропуснати дубликати
          </Text>
          <Text className="font-inter-semibold text-body-lg text-on-surface-variant opacity-70">
            {summary.duplicates}
          </Text>
        </View>
        <HairlineDivider />
        <View className="flex-row items-center justify-between py-md">
          <Text className="font-inter text-body-lg text-on-surface-variant opacity-70">
            {`В категория „Други"`}
          </Text>
          <Text className="font-inter-semibold text-body-lg text-on-surface-variant opacity-70">
            {summary.other}
          </Text>
        </View>
        <HairlineDivider />
      </View>
    </>
  );
}
