import React, { createContext, useContext, useState, useCallback } from 'react';
import { Action, AppointmentState } from '../types';

interface OrthodonticAppointmentContextType extends AppointmentState {
  addAction: (action: Omit<Action, 'id' | 'timestamp'>) => void;
  removeAction: (id: string) => void;
  updateNotes: (text: string) => void;
  addAttachment: (file: File) => void;
  removeAttachment: (id: string) => void;
  resetAppointment: () => void;
}

const OrthodonticAppointmentContext = createContext<OrthodonticAppointmentContextType | undefined>(undefined);

export const OrthodonticAppointmentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppointmentState>({
    actions: [],
    notes: '',
    attachments: [],
  });

  const addAction = useCallback((actionData: Omit<Action, 'id' | 'timestamp'>) => {
    const newAction: Action = {
      ...actionData,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
    };
    setState(prev => ({
      ...prev,
      actions: [...prev.actions, newAction],
    }));
  }, []);

  const removeAction = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      actions: prev.actions.filter(a => a.id !== id),
    }));
  }, []);

  const updateNotes = useCallback((text: string) => {
    setState(prev => ({
      ...prev,
      notes: text,
    }));
  }, []);

  const addAttachment = useCallback((file: File) => {
    const id = Math.random().toString(36).substr(2, 9);
    const attachment = {
      id,
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    };
    setState(prev => ({
      ...prev,
      attachments: [...prev.attachments, attachment],
    }));
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setState(prev => {
      const attachment = prev.attachments.find(a => a.id === id);
      if (attachment?.preview) {
        URL.revokeObjectURL(attachment.preview);
      }
      return {
        ...prev,
        attachments: prev.attachments.filter(a => a.id !== id),
      };
    });
  }, []);

  const resetAppointment = useCallback(() => {
    state.attachments.forEach(a => {
      if (a.preview) URL.revokeObjectURL(a.preview);
    });
    setState({
      actions: [],
      notes: '',
      attachments: [],
    });
  }, [state.attachments]);

  return (
    <OrthodonticAppointmentContext.Provider value={{
      ...state,
      addAction,
      removeAction,
      updateNotes,
      addAttachment,
      removeAttachment,
      resetAppointment,
    }}>
      {children}
    </OrthodonticAppointmentContext.Provider>
  );
};

export const useOrthodonticAppointment = () => {
  const context = useContext(OrthodonticAppointmentContext);
  if (context === undefined) {
    throw new Error('useOrthodonticAppointment must be used within an OrthodonticAppointmentProvider');
  }
  return context;
};
