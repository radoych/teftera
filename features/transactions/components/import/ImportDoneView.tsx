import type { ReactNode } from 'react';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { Screen } from '@/components/Screen';
import { ImportSummaryView, type ImportSummary } from './ImportSummaryView';

/** After a successful import: the counts and a single "done" action. */
export function ImportDoneView({
  header,
  summary,
  onDone,
}: {
  header: ReactNode;
  summary: ImportSummary;
  onDone: () => void;
}) {
  return (
    <Screen
      floatingAboveTabBar={
        <FloatingActionBar
          compact
          actions={[{ label: 'Готово', icon: 'check', variant: 'filled', onPress: onDone }]}
        />
      }>
      {header}
      <ImportSummaryView summary={summary} />
    </Screen>
  );
}
