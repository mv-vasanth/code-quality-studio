import { useState, useEffect, useCallback } from "react";
import { loadChecked, saveChecked, loadUncheckedPracticeTitles } from "./practiceChecklistStorage.js";

// Re-exported for existing importers. Anything that runs outside the browser
// (CLI, MCP, report builders) should import from practiceChecklistStorage.js
// directly — importing from here pulls in React.
export { loadUncheckedPracticeTitles };

export function usePracticeChecklist(storageKey, practices) {
  const [checked, setChecked] = useState(() => loadChecked(storageKey));

  useEffect(() => {
    setChecked(loadChecked(storageKey));
  }, [storageKey]);

  useEffect(() => {
    saveChecked(storageKey, checked);
  }, [storageKey, checked]);

  const toggleChecked = useCallback((id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const resetChecklist = useCallback(() => setChecked(new Set()), []);

  const passedCount = practices.filter((p) => checked.has(p.id)).length;

  return {
    checked,
    toggleChecked,
    resetChecklist,
    passedCount,
    totalCount: practices.length,
  };
}
