export function lessonViewState(activeTab, settingsOpen) {
  const tabs = ["meaning", "characters", "practice"];
  return Object.fromEntries(tabs.map((tab) => [tab, !settingsOpen && tab === activeTab]));
}
