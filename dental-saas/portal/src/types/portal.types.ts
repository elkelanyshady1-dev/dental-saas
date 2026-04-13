/* ─── Portal Domain Types ─────────────────────────────────────────── */

export interface PortalUser {
  patientUserId: string;
  organizationId: string;
  patientId: string;
  email: string;
  portalPermissions: {
    canBookAppointment: boolean;
    canCancelAppointment: boolean;
    canViewInvoices: boolean;
    canViewMedicalHistory: boolean;
    canUploadFiles: boolean;
  };
}

/* ─── Dashboard ───────────────────────────────────────────────────── */

export interface DashboardData {
  profile: PatientProfile;
  nextAppointment: Appointment | null;
  financial: FinancialSummary;
}

export interface PatientProfile {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  financial: FinancialSummary;
  clinical?: ClinicalData;
}

export interface FinancialSummary {
  totalInvoiced: number;
  totalPaid: number;
  balance: number;
}

/* ─── Appointments ────────────────────────────────────────────────── */

export interface Appointment {
  _id: string;
  patientId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  doctor?: {
    firstName: string;
    lastName: string;
  };
  branchId?: string;
  notes?: string;
}

/* ─── Financial ───────────────────────────────────────────────────── */

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  status: 'PAID' | 'UNPAID' | 'OVERDUE' | 'PARTIALLY_PAID';
  items: InvoiceItem[];
}

export interface InvoiceItem {
  description: string;
  amount: number;
  quantity?: number;
}

export interface Payment {
  _id: string;
  invoiceId: string;
  date: string;
  amount: number;
  method: string;
  reference: string;
}

/* ─── Medical History ─────────────────────────────────────────────── */

export interface ClinicalData {
  medicalHistory: Record<string, unknown>;
  allergies: string[];
  medications: string[];
  conditions: string[];
}

export interface MedicalQuestionnaire {
  _id: string;
  title: string;
  date: string;
  status: 'COMPLETED' | 'PENDING';
  questions: { question: string; answer: string }[];
}

/* ─── Orthodontics / Monitoring ───────────────────────────────────── */

export interface AlignerProgress {
  _id: string;
  stageNumber: number;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  scheduledStartDate?: string;
  startedAt?: string;
  completedAt?: string;
  wearDurationDays: number;
  patientPainLevel?: number;
  patientWearHours?: number;
  monitoringSubmitted: boolean;
  doctorNotes?: string;
}

export interface MonitoringSession {
  _id: string;
  stageNumber: number;
  status: 'submitted' | 'under_review' | 'approved' | 'revision_required';
  patientNote: string;
  doctorNotes?: string;
  doctorFeedback?: string;
  reviewedAt?: string;
  aiSummary?: {
    overallStatus: 'on_track' | 'needs_attention' | 'review_required' | 'unknown';
    photoCount: number;
    flagCount: number;
  };
  revisionDetails?: {
    requiredPhotos: string[];
    message: string;
  };
  createdAt: string;
}

export interface PatientPhoto {
  _id: string;
  stageNumber: number;
  photoType: 'front' | 'left' | 'right' | 'bite' | 'upper' | 'lower';
  fileKey: string;
  originalFileName?: string;
  aiAnalysisStatus: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'skipped';
  aiFindings?: {
    alignerFit: 'good' | 'poor' | 'unknown';
    toothMovement: 'on_track' | 'behind' | 'unknown';
    flags: string[];
    confidence: number;
  };
  createdAt: string;
}

/* ─── Messaging ───────────────────────────────────────────────────── */

export interface PatientMessage {
  _id: string;
  senderType: 'patient' | 'doctor' | 'system';
  messageType: 'text' | 'image' | 'system';
  message: string;
  attachments: {
    fileKey: string;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
  }[];
  isReadByPatient: boolean;
  isReadByDoctor: boolean;
  createdAt: string;
}

/* ─── Reminders (UI-only for now) ─────────────────────────────────── */

export interface Reminder {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  type: 'APPOINTMENT' | 'MEDICATION' | 'HYGIENE' | 'ELASTICS';
  priority: 'high' | 'medium' | 'low';
  isRead: boolean;
}

/* ─── API Response Envelope ───────────────────────────────────────── */

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
