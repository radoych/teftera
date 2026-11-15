import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { SectionLabel } from '@/components/SectionLabel';
import { Skeleton } from '@/components/Skeleton';
import type { SummaryStatus } from '@/features/insights/summaryStore';
import { colors } from '@/lib/theme';

interface AiSummaryCardProps {
  status: SummaryStatus;
  text: string | null;
}

/** AI summary — generated, session-cached; hidden on error/idle. */
export function AiSummaryCard({ status, text }: AiSummaryCardProps) {
  return status === 'loading' || (status === 'ready' && text) ? (
    <View className="mt-xl flex-row gap-md">
      <View className="w-1 rounded-full bg-surface-tint opacity-30" />
      <View className="flex-1 gap-sm">
        <View className="flex-row items-center gap-sm">
          <MaterialIcons name="auto-awesome" size={14} color={colors.onSurfaceVariant} />
          <SectionLabel>AI обобщение</SectionLabel>
        </View>
        {status === 'loading' ? (
          <Skeleton height={48} />
        ) : (
          <Text className="font-inter text-body-md leading-relaxed text-on-surface-variant">
            {text}
          </Text>
        )}
      </View>
    </View>
  ) : null;
}
