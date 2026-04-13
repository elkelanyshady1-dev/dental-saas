/**
 * useLabSocket.js — Real-Time Lab Cache Invalidation
 *
 * RULE 12.4: receive event → validate type → invalidateQueries → API refetch → render
 * RULE 12.5: cleanup on unmount required
 *
 * PLANE: Org only.
 */

import { useEffect }       from "react";
import { useQueryClient }  from "@tanstack/react-query";
import { QK }              from "@/lib/query/queryKeys";

/**
 * useLabSocket
 * @param {object} socket — org plane Socket.io instance
 */
export function useLabSocket(socket) {
    const qc = useQueryClient();

    useEffect(() => {
        if (!socket) return;

        function handleCaseUpdated(event) {
            if (!event || event.type !== "lab.case.updated.v1") return;
            qc.invalidateQueries({ queryKey: QK.lab.all });
        }

        function handleMessageSent(event) {
            if (!event || event.type !== "lab.message.sent.v1") return;
            if (event.caseId) {
                qc.invalidateQueries({ queryKey: QK.lab.messages(event.caseId) });
            }
        }

        socket.on("lab.case.updated.v1",  handleCaseUpdated);
        socket.on("lab.message.sent.v1",  handleMessageSent);

        // RULE 12.5 — mandatory cleanup
        return () => {
            socket.off("lab.case.updated.v1",  handleCaseUpdated);
            socket.off("lab.message.sent.v1",  handleMessageSent);
        };
    }, [socket, qc]);
}
