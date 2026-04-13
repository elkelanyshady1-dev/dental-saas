/**
 * useConfirmAction.ts — Destructive Action Confirmation Hook
 *
 * Wraps any destructive action (delete, archive, reset) with a confirmation modal.
 * Uses AppModal component for consistent UX across the application.
 *
 * USAGE:
 *   const { confirm, confirmProps } = useConfirmAction();
 *
 *   const handleDelete = () => {
 *     confirm(
 *       {
 *         title: "Delete Case?",
 *         description: "This case cannot be recovered.",
 *         confirmText: "Delete",
 *         type: "danger",
 *       },
 *       async () => {
 *         await api.deleteCase(id);
 *       }
 *     );
 *   };
 *
 *   return (
 *     <>
 *       <button onClick={handleDelete}>Delete</button>
 *       <AppModal {...confirmProps}>
 *         {/* Modal content rendered by AppModal */}
 *       </AppModal>
 *     </>
 *   );
 */

import { useState, useCallback } from 'react';

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'default';
}

interface ConfirmState {
  isOpen: boolean;
  options: ConfirmOptions | null;
  onConfirm: (() => void | Promise<void>) | null;
  isLoading: boolean;
}

export interface ConfirmProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  description: string;
  confirmText: string;
  cancelText: string;
  type: 'danger' | 'warning' | 'default';
  isLoading: boolean;
}

/**
 * useConfirmAction
 *
 * Returns a `confirm` function and `confirmProps` for AppModal.
 * Handles async actions with loading state and error recovery.
 */
export function useConfirmAction() {
  const [state, setState] = useState<ConfirmState>({
    isOpen: false,
    options: null,
    onConfirm: null,
    isLoading: false,
  });

  const confirm = useCallback(
    (options: ConfirmOptions, action: () => void | Promise<void>) => {
      setState({
        isOpen: true,
        options,
        onConfirm: action,
        isLoading: false,
      });
    },
    []
  );

  const handleConfirm = useCallback(async () => {
    if (!state.onConfirm) return;

    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      await state.onConfirm();
      setState({
        isOpen: false,
        options: null,
        onConfirm: null,
        isLoading: false,
      });
    } catch (error) {
      // Keep modal open on error; caller can handle via toast or modal content
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [state.onConfirm]);

  const handleClose = useCallback(() => {
    setState({
      isOpen: false,
      options: null,
      onConfirm: null,
      isLoading: false,
    });
  }, []);

  const confirmProps: ConfirmProps = {
    isOpen: state.isOpen,
    onClose: handleClose,
    onConfirm: handleConfirm,
    title: state.options?.title ?? '',
    description: state.options?.description ?? '',
    confirmText: state.options?.confirmText ?? 'Confirm',
    cancelText: state.options?.cancelText ?? 'Cancel',
    type: state.options?.type ?? 'default',
    isLoading: state.isLoading,
  };

  return {
    confirm,
    confirmProps,
  };
}

export default useConfirmAction;
