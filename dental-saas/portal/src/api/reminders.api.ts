/**
 * reminders.api.ts
 * Patient Portal — Reminders (Local Mock Service)
 *
 * Backend API for reminders is not yet implemented.
 * This provides a localStorage-backed mock that mirrors the future API shape.
 * Replace localStorage calls with portalApi when backend is ready.
 */

import type { Reminder } from '@/types/portal.types';

const STORAGE_KEY = 'portal_reminders';

const DEFAULT_REMINDERS: Reminder[] = [
  {
    id: 'r1',
    title: 'Wear Elastics',
    description: 'Remember to wear your Class II elastics 22 hours a day.',
    date: new Date().toISOString().split('T')[0],
    time: '08:00',
    type: 'ELASTICS',
    priority: 'high',
    isRead: false,
  },
  {
    id: 'r2',
    title: 'Brush & Floss',
    description: 'Maintain good hygiene around your brackets and wires.',
    date: new Date().toISOString().split('T')[0],
    time: '20:00',
    type: 'HYGIENE',
    priority: 'medium',
    isRead: false,
  },
  {
    id: 'r3',
    title: 'Take Medication',
    description: 'Do not forget your prescribed medication after meals.',
    date: new Date().toISOString().split('T')[0],
    time: '13:00',
    type: 'MEDICATION',
    priority: 'medium',
    isRead: false,
  },
];

function getStoredReminders(): Reminder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_REMINDERS;
  } catch {
    return DEFAULT_REMINDERS;
  }
}

function saveReminders(reminders: Reminder[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
}

export const remindersApi = {
  /** List all reminders */
  getReminders: async (): Promise<{ success: true; data: Reminder[] }> => {
    const reminders = getStoredReminders();
    return { success: true, data: reminders };
  },

  /** Toggle read/complete status */
  toggleReminder: async (id: string): Promise<{ success: true; data: Reminder }> => {
    const reminders = getStoredReminders();
    const idx = reminders.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error('Reminder not found');
    reminders[idx].isRead = !reminders[idx].isRead;
    saveReminders(reminders);
    return { success: true, data: reminders[idx] };
  },

  /** Add a reminder */
  addReminder: async (data: Omit<Reminder, 'id' | 'isRead'>): Promise<{ success: true; data: Reminder }> => {
    const reminders = getStoredReminders();
    const newReminder: Reminder = {
      ...data,
      id: `r_${Date.now()}`,
      isRead: false,
    };
    reminders.push(newReminder);
    saveReminders(reminders);
    return { success: true, data: newReminder };
  },

  /** Delete a reminder */
  deleteReminder: async (id: string): Promise<{ success: true }> => {
    const reminders = getStoredReminders().filter((r) => r.id !== id);
    saveReminders(reminders);
    return { success: true };
  },
};
