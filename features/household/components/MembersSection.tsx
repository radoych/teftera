import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { HairlineDivider } from '@/components/HairlineDivider';
import { SectionLabel } from '@/components/SectionLabel';
import { type HouseholdMember } from '@/features/household/api';
import { formatInviteCode } from '@/features/household/inviteCode';
import { initials } from '@/lib/initials';
import { colors } from '@/lib/theme';

interface MembersSectionProps {
  members: HouseholdMember[];
  inviteCode: string;
  onInvite: () => void;
}

export function MembersSection({ members, inviteCode, onInvite }: MembersSectionProps) {
  return (
    <View className="mt-xl">
      <SectionLabel className="mb-md">Домакинство</SectionLabel>
      {members.map((m) => {
        const memberInitials = initials(m.displayName);
        const memberName = m.displayName || 'Без име';
        const roleLabel = m.role === 'owner' ? 'Собственик' : 'Член';
        return (
          <View key={m.userId}>
            <View className="flex-row items-center gap-md py-md">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container">
                <Text className="font-inter-semibold text-body-md text-on-surface-variant">
                  {memberInitials}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="font-inter text-body-lg text-on-surface">
                  {memberName}
                </Text>
                <Text className="font-inter text-label-md text-on-surface-variant opacity-60">
                  {roleLabel}
                </Text>
              </View>
            </View>
            <HairlineDivider />
          </View>
        );
      })}
      <Pressable onPress={onInvite} className="flex-row items-center gap-3 py-5 active:opacity-70">
        <MaterialIcons name="person-add" size={20} color={colors.primaryContainer} />
        <Text className="font-inter text-body-md text-primary-container">
          Покани член
        </Text>
      </Pressable>
      {inviteCode ? (
        <Text className="mt-2 font-inter-semibold text-body-lg tracking-widest text-primary">
          {formatInviteCode(inviteCode)}
        </Text>
      ) : null}
    </View>
  );
}
