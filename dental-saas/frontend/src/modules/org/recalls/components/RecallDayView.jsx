/**
 * RecallDayView — Single-day list. Overdue recalls bubble to the top.
 */

import { useMemo } from "react";
import RecallCard from "./RecallCard";
import EmptyState from "./EmptyState";
import { isOverdue } from "../utils/dateRange";

export default function RecallDayView({ recalls, isFiltered, onConvert, onCancel, onCreate, mutatingId }) {
    const sorted = useMemo(() => {
        if (!Array.isArray(recalls)) return [];
        return [...recalls].sort((a, b) => {
            const ao = isOverdue(a) ? 0 : 1;
            const bo = isOverdue(b) ? 0 : 1;
            if (ao !== bo) return ao - bo;
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        });
    }, [recalls]);

    if (!sorted.length) {
        // "All caught up" only fires if there's no filter narrowing the view.
        return (
            <EmptyState
                variant={isFiltered ? "filtered" : "caughtUp"}
                onCreate={onCreate}
            />
        );
    }

    return (
        <div className="px-8 py-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((r) => (
                <RecallCard
                    key={r._id}
                    recall={r}
                    onConvert={onConvert}
                    onCancel={onCancel}
                    isMutating={mutatingId === r._id}
                />
            ))}
        </div>
    );
}
