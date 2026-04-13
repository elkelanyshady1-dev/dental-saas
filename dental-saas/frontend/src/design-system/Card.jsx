/**
 * Card (Design System v2.0)
 * Standard reusable card with soft shadow and rounded corners.
 */
export default function Card({ children, className = "" }) {
    return (
        <div className={`rounded-2xl bg-white p-6 shadow-sm border border-gray-100 ${className}`}>
            {children}
        </div>
    );
}
