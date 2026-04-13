/**
 * TimelineItem.jsx — Single treatment timeline event card.
 *
 * Supports event types: treatment | appointment | note | image | lab | payment
 */

const TYPE_CONFIG = {
  treatment: {
    icon: "🦷",
    color: "bg-violet-600",
    ring: "ring-violet-200",
    label: "ACTIVE TREATMENT",
    labelColor: "text-violet-600",
  },
  appointment: {
    icon: "📅",
    color: "bg-blue-500",
    ring: "ring-blue-200",
    label: "APPOINTMENT",
    labelColor: "text-blue-600",
  },
  note: {
    icon: "📝",
    color: "bg-amber-500",
    ring: "ring-amber-200",
    label: "CLINICAL NOTE",
    labelColor: "text-amber-600",
  },
  image: {
    icon: "🖼",
    color: "bg-slate-500",
    ring: "ring-slate-200",
    label: "IMAGE UPLOAD",
    labelColor: "text-slate-500",
  },
  lab: {
    icon: "🧪",
    color: "bg-teal-500",
    ring: "ring-teal-200",
    label: "LAB ORDER",
    labelColor: "text-teal-600",
  },
  payment: {
    icon: "💳",
    color: "bg-emerald-500",
    ring: "ring-emerald-200",
    label: "PAYMENT",
    labelColor: "text-emerald-600",
  },
};

const STATUS_CONFIG = {
  "IN PROGRESS": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "COMPLETED":   "bg-slate-100 text-slate-600 border-slate-200",
  "PENDING":     "bg-amber-50 text-amber-700 border-amber-200",
  "CANCELLED":   "bg-red-50 text-red-600 border-red-200",
};

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function TimelineItem({ item, isFirst }) {
  const {
    type = "note",
    title,
    date,
    description,
    status,
    images = [],
    actions = [],
    amount,
    currency = "EGP",
  } = item;

  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.note;

  return (
    <div className="relative flex gap-4">
      {/* ── Vertical line connector ── */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className={`w-9 h-9 rounded-xl ${cfg.color} ring-4 ${cfg.ring} flex items-center justify-center text-white text-base shadow-sm z-10`}
        >
          {cfg.icon}
        </div>
        {/* Line below icon (extends down unless last item handled by parent) */}
        <div className="w-px flex-1 bg-slate-200 mt-1" />
      </div>

      {/* ── Content card ── */}
      <div
        className={`flex-1 mb-4 bg-white rounded-2xl border transition-shadow hover:shadow-md ${
          type === "treatment" ? "border-violet-200 shadow-sm" : "border-slate-100"
        }`}
      >
        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{title}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-black uppercase tracking-wider ${cfg.labelColor}`}>
                  {cfg.label}
                </span>
                {date && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {formatTime(date) || formatDate(date)}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {date && (
                <span className="text-[10px] text-slate-400 font-semibold">{formatDate(date)}</span>
              )}
              {status && (
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-lg border tracking-wide ${
                    STATUS_CONFIG[status] || STATUS_CONFIG["PENDING"]
                  }`}
                >
                  {status}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {description && (
            <p className="text-[13px] text-slate-600 leading-relaxed mt-2">{description}</p>
          )}

          {/* Payment amount */}
          {type === "payment" && amount != null && (
            <p className="text-sm font-black text-emerald-600 mt-2">
              +{amount.toLocaleString()} {currency}
            </p>
          )}

          {/* Images grid */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {images.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`clinical-image-${i}`}
                  className="w-20 h-16 object-cover rounded-xl border border-slate-200 cursor-pointer hover:opacity-90 transition-opacity"
                />
              ))}
            </div>
          )}

          {/* Action buttons */}
          {actions.length > 0 && (
            <div className="flex items-center gap-2 mt-3">
              {actions.map((action, i) => (
                <button
                  key={i}
                  id={`timeline-action-${action.label?.replace(/\s+/g, "-").toLowerCase()}-${i}`}
                  onClick={action.onClick}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                    i === 0
                      ? "bg-violet-600 text-white hover:bg-violet-700"
                      : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {action.icon && <span>{action.icon}</span>}
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
