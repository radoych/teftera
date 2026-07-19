import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { HairlineDivider } from '@/components/HairlineDivider';
import { SectionLabel } from '@/components/SectionLabel';
import { formatCurrency } from '@/lib/formatCurrency';

interface AnomalyCard {
  id: string;
  transactionId: string;
  merchant: string;
  amountCents: number;
  reason: string;
}

interface AnomalyCardsProps {
  cards: AnomalyCard[];
  onReview: (anomalyId: string, transactionId: string) => void;
}

/** Anomalies — flagged transaction cards with a review action. */
export function AnomalyCards({ cards, onReview }: AnomalyCardsProps) {
  return cards.length > 0 ? (
    <>
      <HairlineDivider className="my-xl" />
      <SectionLabel className="mb-md">Аномалии</SectionLabel>
      <View className="gap-md">
        {cards.map((a) => (
          <View
            key={a.id}
            className="flex-row items-center justify-between rounded-xl border border-secondary-fixed/20 bg-secondary-fixed/5 p-md"
          >
            <View className="flex-1 flex-row items-center gap-md">
              <View className="relative">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high">
                  <MaterialIcons name="warning" size={20} color="#c3f400" />
                </View>
                <View className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background bg-secondary-fixed" />
              </View>
              <View className="flex-1">
                <Text
                  numberOfLines={1}
                  className="font-inter-semibold text-body-md text-on-surface"
                >
                  {a.merchant}
                </Text>
                <Text
                  numberOfLines={1}
                  className="font-inter text-[10px] uppercase text-secondary-fixed"
                >
                  {a.reason}
                </Text>
              </View>
            </View>
            <View className="items-end gap-1">
              <Text className="font-inter-semibold text-data-mono text-secondary-fixed">
                {formatCurrency(a.amountCents)}
              </Text>
              <Pressable
                onPress={() => onReview(a.id, a.transactionId)}
                hitSlop={6}
              >
                <Text className="font-inter-semibold text-label-md text-primary">
                  Прегледай
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </>
  ) : null;
}
