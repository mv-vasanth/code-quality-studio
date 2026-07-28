import { useState, useEffect, useCallback } from "react";

function loadChecked(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveChecked(storageKey, set) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

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

export function loadUncheckedPracticeTitles(storageKey, practices) {
  try {
    const raw = localStorage.getItem(storageKey);
    const passedIds = new Set(raw ? JSON.parse(raw) : []);
    return practices.filter((p) => !passedIds.has(p.id)).map((p) => p.title);
  } catch {
    return practices.map((p) => p.title);
  }
}
