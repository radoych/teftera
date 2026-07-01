export type DashboardSectionKey = 'categories' | 'recent';

export interface DashboardSection {
  key: DashboardSectionKey;
  visible: boolean;
}

export interface UserPreferences {
  version: 1;
  dashboardSections: DashboardSection[];
  budgetAlertsEnabled?: boolean; // default true when absent
}
