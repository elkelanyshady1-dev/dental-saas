/**
 * PatientSummaryCards.jsx
 * Right-panel cards: Treatment Summary, Financial Summary, Next Appointment, Medical Flags.
 */

/* ───────────────────────────────────────────────
   Card Wrapper
─────────────────────────────────────────────── */
function Card({ title, children, action }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
        <h3 className="text-sm font-black text-slate-900">{title}</h3>
        {action && (
          <button className="text-[10px] font-bold text-violet-500 hover:text-violet-700 transition-colors">
            {action}
          </button>
        )}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

/* ───────────────────────────────────────────────
   1. Treatment Summary
─────────────────────────────────────────────── */
export function PatientSummaryCard({ patient }) {
  const { treatmentProgress = 0, treatmentStage = "—", treatmentName = "Invisalign Treatment" } = patient || {};

  return (
    <Card title="Patient Summary" action="ℹ️">
      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Treatment Status
          </span>
          <span className="text-[10px] font-black text-violet-600">{treatmentProgress}% Complete</span>
        </div>
        <div className="h-2 bg-violet-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-purple-600 rounded-full transition-all duration-700"
            style={{ width: `${Math.min(treatmentProgress, 100)}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">
          {treatmentName} (Stage {treatmentStage})
        </p>
      </div>
    </Card>
  );
}

/* ───────────────────────────────────────────────
   2. Financial Summary
─────────────────────────────────────────────── */
export function FinancialSummary({ patient, onReminder }) {
  const {
    totalTreatment = 0,
    amountPaid = 0,
    balanceDue = 0,
    currency = "EGP",
  } = patient || {};

  return (
    <Card title="Financial Summary">
      <div className="space-y-3">
        <FinRow label="Total Treatment" value={`${totalTreatment.toLocaleString()} ${currency}`} />
        <FinRow label="Amount Paid"    value={`${amountPaid.toLocaleString()} ${currency}`} color="text-emerald-600" />
        <div className="border-t border-slate-100 pt-3">
          <FinRow
            label="Balance Due"
            value={`${balanceDue.toLocaleString()} ${currency}`}
            color={balanceDue > 0 ? "text-red-500" : "text-emerald-600"}
            bold
          />
        </div>
      </div>

      {balanceDue > 0 && (
        <button
          id="btn-send-payment-reminder"
          onClick={onReminder}
          className="mt-4 w-full py-2.5 rounded-xl bg-violet-50 text-violet-700 border border-violet-200 text-sm font-bold hover:bg-violet-100 transition-colors active:scale-95"
        >
          Send Payment Reminder
        </button>
      )}
    </Card>
  );
}

function FinRow({ label, value, color = "text-slate-800", bold }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500 font-medium">{label}</span>
      <span className={`text-sm font-${bold ? "black" : "bold"} ${color}`}>{value}</span>
    </div>
  );
}

/* ───────────────────────────────────────────────
   3. Next Appointment
─────────────────────────────────────────────── */
export function NextAppointmentCard({ appointment }) {
  if (!appointment) {
    return (
      <Card title="Next Appointment">
        <p className="text-xs text-slate-400 italic text-center py-2">No upcoming appointments</p>
      </Card>
    );
  }

  const { date, time, doctor, procedure } = appointment;

  const d = date ? new Date(date) : null;
  const day   = d ? d.toLocaleDateString("en-GB", { day: "2-digit" }) : "—";
  const month = d ? d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase() : "";

  return (
    <Card title="Next Appointment">
      <div
        className="flex items-start gap-3 bg-violet-50 border border-violet-100 rounded-xl p-3"
      >
        {/* Date badge */}
        <div className="flex flex-col items-center justify-center bg-violet-600 text-white rounded-xl w-10 py-1 flex-shrink-0">
          <span className="text-[9px] font-black uppercase tracking-wide leading-tight">{month}</span>
          <span className="text-lg font-black leading-tight">{day}</span>
        </div>

        {/* Details */}
        <div>
          <p className="text-sm font-bold text-slate-800">{procedure || "Appointment"}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {time && <span>{time} • </span>}
            {doctor}
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────────────────────────────
   4. Medical Flags
─────────────────────────────────────────────── */
const FLAG_STYLES = [
  { bg: "bg-red-50",    border: "border-red-200",    text: "text-red-700",    icon: "⚠️" },
  { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  icon: "🔔" },
  { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700",   icon: "💊" },
  { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", icon: "🩺" },
];

export function MedicalFlagsCard({ flags = [] }) {
  if (!flags.length) {
    return (
      <Card title="Medical Flags">
        <p className="text-xs text-slate-400 italic text-center py-2">No medical flags recorded</p>
      </Card>
    );
  }

  return (
    <Card title="Medical Flags" action="Edit">
      <div className="space-y-2">
        {flags.map((flag, i) => {
          const style = FLAG_STYLES[i % FLAG_STYLES.length];
          return (
            <div
              key={i}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${style.bg} ${style.border}`}
            >
              <span className="text-sm">{style.icon}</span>
              <span className={`text-xs font-bold ${style.text}`}>{flag}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
