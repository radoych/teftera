export type DashboardSectionKey = 'categories' | 'recent';

// Type aliases (not interfaces) so they are assignable to the generated `Json` type of
// the `user_preferences.settings` jsonb column — interfaces have no index signature.
export type DashboardSection = {
  key: DashboardSectionKey;
  visible: boolean;
};

export type UserPreferences = {
  version: 1;
  dashboardSections: DashboardSection[];
  budgetAlertsEnabled?: boolean; // default true when absent
  anomalyAlertsEnabled?: boolean; // default true when absent
};
