import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'clinical_assistant_usage';

export function useUsageLearning() {
  const [usage, setUsage] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setUsage(JSON.parse(stored));
      }
    } catch (err) {
      console.warn('Failed to load usage data', err);
    }
  }, []);

  const recordUsage = useCallback((commandText: string) => {
    const text = commandText.trim().toLowerCase();
    if (!text) return;

    setUsage(prev => {
      const next = { ...prev };
      next[text] = (next[text] || 0) + 1;
      
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn('Failed to save usage data', err);
      }
      return next;
    });
  }, []);

  const getUsageScore = useCallback((commandText: string) => {
    return usage[commandText.trim().toLowerCase()] || 0;
  }, [usage]);

  return { usage, recordUsage, getUsageScore };
}
