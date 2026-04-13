/**
 * useInventorySocket.js — Real-Time Inventory Cache Invalidation
 *
 * RULE 12.4: receive event → validate type → invalidateQueries → API refetch → render
 * RULE 12.5: cleanup on unmount required
 *
 * Listens for inventory.updated.v1 socket events and invalidates
 * the full inventory query tree.
 *
 * PLANE: Org only.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/query/queryKeys";

/**
 * useInventorySocket
 *
 * @param {object} socket — org plane socket instance (from SocketContext)
 */
export function useInventorySocket(socket) {
    const qc = useQueryClient();

    useEffect(() => {
        if (!socket) return;

        function handleInventoryUpdate(event) {
            // RULE 12.2 — validate type only, no data from event
            if (!event || event.type !== "inventory.updated.v1") return;

            // RULE 12.4 — invalidate → API refetch → render
            qc.invalidateQueries({ queryKey: QK.inventory.all });
        }

        socket.on("inventory.updated.v1", handleInventoryUpdate);

        // RULE 12.5 — mandatory cleanup
        return () => {
            socket.off("inventory.updated.v1", handleInventoryUpdate);
        };
    }, [socket, qc]);
}
