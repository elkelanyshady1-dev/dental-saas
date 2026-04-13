/**
 * useModal.js — Modal State Management Hook
 *
 * Provides clean control for AppModal confirmation dialogs.
 *
 * Usage:
 *   const { isOpen, modalData, openModal, closeModal } = useModal();
 *
 *   const handleDelete = () => {
 *     openModal({
 *       title: 'Delete Item?',
 *       description: 'This action cannot be undone.',
 *       type: 'danger',
 *       confirmText: 'Delete',
 *       onConfirm: async () => {
 *         await deleteItem(id);
 *         closeModal();
 *       },
 *     });
 *   };
 *
 *   return (
 *     <>
 *       <button onClick={handleDelete}>Delete</button>
 *       <AppModal isOpen={isOpen} onClose={closeModal} {...modalData} />
 *     </>
 *   );
 */

import { useState, useCallback } from 'react';

export const useModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [modalData, setModalData] = useState({});

  const openModal = useCallback((data = {}) => {
    setModalData(data);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    // Clear data after animation completes
    setTimeout(() => setModalData({}), 150);
  }, []);

  return {
    isOpen,
    modalData,
    openModal,
    closeModal,
  };
};

/**
 * useConfirmModal — Specialized hook for confirmation flows
 *
 * Returns a confirm function that returns a Promise resolving to true/false.
 * Useful for async/await flows:
 *
 *   const confirm = useConfirmModal();
 *   const handleDelete = async () => {
 *     const confirmed = await confirm({ title: 'Delete?', type: 'danger' });
 *     if (confirmed) await deleteItem();
 *   };
 */
export const useConfirmModal = () => {
  const [state, setState] = useState({
    isOpen: false,
    resolver: null,
    data: {},
    loading: false,
  });

  const confirm = useCallback((data = {}) => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        resolver: resolve,
        data,
        loading: false,
      });
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      if (state.data.onConfirm) {
        await state.data.onConfirm();
      }
      state.resolver?.(true);
    } catch (err) {
      console.error('[useConfirmModal] onConfirm error:', err);
      state.resolver?.(false);
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [state.data, state.resolver]);

  const handleClose = useCallback(() => {
    state.resolver?.(false);
    setState({ isOpen: false, resolver: null, data: {}, loading: false });
  }, [state.resolver]);

  return {
    confirm,
    confirmProps: {
      isOpen: state.isOpen,
      onClose: handleClose,
      onConfirm: handleConfirm,
      loading: state.loading,
      ...state.data,
    },
    ConfirmModal: () => null, // Placeholder for component mounting
  };
};

export default useModal;