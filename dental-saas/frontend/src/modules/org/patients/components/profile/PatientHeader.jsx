/**
 * PatientHeader.jsx — Patient Profile Header
 * Shows avatar, identity, quick stats (balance/last visit), and action buttons.
 */
import { useState } from "react";

const GRADIENTS = [
  "from-violet-400 to-purple-600",
  "from-blue-400 to-indigo-600",
  "from-rose-400 to-pink-600",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-600",
];

function avatarGradient(name = "") {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

function Avatar({ name, photo }) {
  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const grad = avatarGradient(name);

  return (
    <div className="relative flex-shrink-0">
      {photo ? (
        <img
          src={photo}
          alt={name}
          className="w-16 h-16 rounded-2xl object-cover ring-2 ring-white shadow-lg"
        />
      ) : (
        <div
          className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${grad} flex items-center justify-center text-white text-xl font-black shadow-lg ring-2 ring-white`}
        >
          {initials}
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, icon, variant = "ghost", onClick, id }) {
  const variants = {
    ghost: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300",
    green: "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50",
    primary: "bg-violet-600 text-white hover:bg-violet-700 shadow-md shadow-violet-200",
    icon: "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 w-9 h-9 !px-0",
  };
  return (
    <button
      id={id}
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 h-9 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-95 ${variants[variant]}`}
    >
      {icon && <span className="text-base leading-none">{icon}</span>}
      {variant !== "icon" && label}
    </button>
  );
}

export default function PatientHeader({ patient, onAppointment }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const {
    name = "Unknown Patient",
    patientCode,
    age,
    gender,
    insurance,
    balanceDue = 0,
    lastVisit,
    photo,
    phone,
    email,
    currency = "EGP",
  } = patient || {};

  const phoneClean = (phone || "").replace(/\D/g, "");

  const formatDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const meta = [
    age ? `${age}y` : null,
    gender || null,
    insurance ? `${insurance} Insurance` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <div className="bg-white border-b border-slate-100 px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        {/* ── Identity ── */}
        <div className="flex items-start gap-4">
          <Avatar name={name} photo={photo} />

          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">{name}</h1>
              {patientCode && (
                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">
                  #{patientCode}
                </span>
              )}
            </div>

            {meta && (
              <p className="text-sm text-slate-500 font-medium">{meta}</p>
            )}

            {/* Quick Stats */}
            <div className="flex items-center gap-4 mt-2">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Balance Due</span>
                <span className={`text-sm font-black ${balanceDue > 0 ? "text-red-500" : "text-emerald-600"}`}>
                  {balanceDue > 0
                    ? `${balanceDue.toLocaleString()} ${currency}`
                    : "Paid"}
                </span>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Last Visit</span>
                <span className="text-sm font-bold text-slate-700">{formatDate(lastVisit)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <ActionButton
            id="btn-call-patient"
            label="Call"
            variant="ghost"
            icon="📞"
            onClick={() => phoneClean && window.open(`tel:${phoneClean}`)}
          />
          <ActionButton
            id="btn-whatsapp-patient"
            label="WhatsApp"
            variant="green"
            icon={
              <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              </svg>
            }
            onClick={() => phoneClean && window.open(`https://wa.me/${phoneClean}`, "_blank")}
          />
          <ActionButton
            id="btn-new-appointment"
            label="Appointment"
            variant="primary"
            icon="+"
            onClick={onAppointment}
          />

          {/* More menu */}
          <div className="relative">
            <button
              id="btn-patient-more"
              onClick={() => setMoreOpen((p) => !p)}
              className="w-9 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="5" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-10 bg-white rounded-2xl border border-slate-100 shadow-xl z-50 py-1 w-44">
                {[
                  { label: "Edit Patient", icon: "✏️" },
                  { label: "Send Reminder", icon: "🔔" },
                  { label: "Send Email", icon: "📧", disabled: !email },
                  { label: "Print Summary", icon: "🖨️" },
                  { label: "Archive Patient", icon: "📁" },
                ].map(({ label, icon, disabled }) => (
                  <button
                    key={label}
                    disabled={disabled}
                    onClick={() => setMoreOpen(false)}
                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${
                      disabled
                        ? "text-slate-300 cursor-not-allowed"
                        : "text-slate-700 hover:bg-violet-50 hover:text-violet-700"
                    }`}
                  >
                    <span>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
