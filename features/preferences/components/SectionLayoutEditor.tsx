import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SegmentedToggle } from '@/components/SegmentedToggle';
import { moveItem, setSectionVisible } from '@/features/preferences/layout';
import type { DashboardSection, DashboardSectionKey } from '@/features/preferences/types';

const ROW_HEIGHT = 56;

const LABELS: Record<DashboardSectionKey, string> = {
  categories: 'По категория',
  recent: 'Последни',
};

interface RowProps {
  section: DashboardSection;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onVisible: (key: DashboardSectionKey, visible: boolean) => void;
}

function DraggableRow({ section, index, count, onMove, onVisible }: RowProps) {
  const translateY = useSharedValue(0);
  const zIndex = useSharedValue(0);

  // No long-press gate: the editor lives in a non-scrolling sheet, so dragging
  // the handle should pick the row up immediately.
  const pan = Gesture.Pan()
    .onStart(() => {
      zIndex.value = 1;
    })
    .onUpdate((e) => {
      translateY.value = e.translationY;
    })
    .onEnd(() => {
      const delta = Math.round(translateY.value / ROW_HEIGHT);
      const target = Math.min(Math.max(index + delta, 0), count - 1);
      translateY.value = 0;
      zIndex.value = 0;
      if (target !== index) runOnJS(onMove)(index, target);
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    zIndex: zIndex.value,
    elevation: zIndex.value * 8, // lift above the neighbour on Android while dragging
  }));

  return (
    <Animated.View style={style}>
      <View
        style={{ height: ROW_HEIGHT }}
        className="flex-row items-center justify-between gap-md bg-surface-container">
        <View className="flex-1 flex-row items-center gap-3">
          <GestureDetector gesture={pan}>
            <View hitSlop={8} className="py-2 pr-1">
              <MaterialIcons name="drag-handle" size={22} color="#8e909a" />
            </View>
          </GestureDetector>
          <Text className="font-inter text-body-lg text-on-surface">{LABELS[section.key]}</Text>
        </View>
        <SegmentedToggle<'on' | 'off'>
          value={section.visible ? 'on' : 'off'}
          onChange={(v) => onVisible(section.key, v === 'on')}
          options={[
            { value: 'on', label: 'Вкл' },
            { value: 'off', label: 'Изкл' },
          ]}
        />
      </View>
    </Animated.View>
  );
}

interface SectionLayoutEditorProps {
  sections: DashboardSection[];
  onChange: (next: DashboardSection[]) => void;
}

/** Drag-to-reorder + show/hide editor for the home sections. */
export function SectionLayoutEditor({ sections, onChange }: SectionLayoutEditorProps) {
  return (
    <View>
      {sections.map((section, index) => (
        <DraggableRow
          key={section.key}
          section={section}
          index={index}
          count={sections.length}
          onMove={(from, to) => onChange(moveItem(sections, from, to))}
          onVisible={(key, visible) => onChange(setSectionVisible(sections, key, visible))}
        />
      ))}
    </View>
  );
}
