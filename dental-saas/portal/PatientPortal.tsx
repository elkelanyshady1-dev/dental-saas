import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Calendar, 
  History, 
  Stethoscope, 
  Smile, 
  Bell, 
  FileText, 
  DollarSign, 
  Camera, 
  MessageSquare, 
  ChevronRight, 
  Plus, 
  Download,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowLeft,
  User,
  LogOut,
  Pill,
  Activity,
  Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Invoice, 
  Payment, 
  Appointment, 
  MedicalQuestionnaire, 
  MedicationPhoto, 
  Reminder,
  PhotoRecord
} from '../../types';

interface PatientPortalProps {
  patientId: string;
  patientName: string;
  onLogout: () => void;
  profilePicture?: string;
}

const translations = {
  en: {
    dashboard: 'Dashboard',
    appointments: 'Appointments',
    financial: 'Financial',
    medical: 'Medical History',
    ortho: 'Orthodontics',
    reminders: 'Reminders',
    nextVisit: 'Next Visit',
    balanceDue: 'Balance Due',
    treatmentProgress: 'Treatment Progress',
    needHelp: 'Need Help?',
    contactClinic: 'Contact our clinic directly if you have any questions.',
    callClinic: 'Call Clinic',
    logout: 'Logout',
    patientId: 'Patient ID',
    scheduled: 'Scheduled',
    completed: 'Completed',
    paid: 'Paid',
    unpaid: 'Unpaid',
    upcomingAppts: 'Upcoming Appointments',
    pastAppts: 'Past Appointments',
    reschedule: 'Reschedule',
    confirm: 'Confirm',
    invoices: 'Invoices',
    paymentHistory: 'Payment History',
    payNow: 'Pay Now',
    medicalQuestionnaires: 'Medical Questionnaires',
    medicationPhotos: 'Medication Photos',
    addPhoto: 'Add Photo',
    progressPhotos: 'Progress Photos',
    treatmentHistory: 'Treatment History',
    remindersTasks: 'Reminders & Tasks',
    addReminder: 'Add Custom Reminder',
    markAsDone: 'Mark as Done',
    notificationSettings: 'Notification Settings',
    notificationDesc: 'Choose how you want to be reminded about your treatment and appointments.',
    pushNotifications: 'Push Notifications',
    emailReminders: 'Email Reminders',
    smsAlerts: 'SMS Alerts',
    welcomeBack: 'Welcome back',
    active: 'Active',
    pending: 'Pending',
    totalAmount: 'Total Amount',
    amountPaid: 'Amount Paid',
    dueDate: 'Due Date',
    viewAll: 'View All',
    uploading: 'Uploading...',
    success: 'Success',
    error: 'Error',
    overdue: 'Overdue'
  },
  ar: {
    dashboard: 'لوحة التحكم',
    appointments: 'المواعيد',
    financial: 'المالية',
    medical: 'التاريخ الطبي',
    ortho: 'تقويم الأسنان',
    reminders: 'التذكيرات',
    nextVisit: 'الزيارة القادمة',
    balanceDue: 'المبلغ المستحق',
    treatmentProgress: 'تقدم العلاج',
    needHelp: 'هل تحتاج مساعدة؟',
    contactClinic: 'اتصل بعيادتنا مباشرة إذا كان لديك أي أسئلة.',
    callClinic: 'اتصل بالعيادة',
    logout: 'تسجيل الخروج',
    patientId: 'رقم المريض',
    scheduled: 'مجدول',
    completed: 'مكتمل',
    paid: 'مدفوع',
    unpaid: 'غير مدفوع',
    overdue: 'متأخر',
    upcomingAppts: 'المواعيد القادمة',
    pastAppts: 'المواعيد السابقة',
    reschedule: 'إعادة جدولة',
    confirm: 'تأكيد',
    invoices: 'الفواتير',
    paymentHistory: 'سجل المدفوعات',
    payNow: 'ادفع الآن',
    medicalQuestionnaires: 'الاستبيانات الطبية',
    medicationPhotos: 'صور الأدوية',
    addPhoto: 'إضافة صورة',
    progressPhotos: 'صور التقدم',
    treatmentHistory: 'سجل العلاج',
    remindersTasks: 'التذكيرات والمهام',
    addReminder: 'إضافة تذكير مخصص',
    markAsDone: 'تم الإنجاز',
    notificationSettings: 'إعدادات التنبيهات',
    notificationDesc: 'اختر كيف تريد أن يتم تذكيرك بعلاجك ومواعيدك.',
    pushNotifications: 'تنبيهات الهاتف',
    emailReminders: 'تذكيرات البريد الإلكتروني',
    smsAlerts: 'رسائل نصية',
    welcomeBack: 'مرحباً بعودتك',
    active: 'نشط',
    pending: 'قيد الانتظار',
    totalAmount: 'المبلغ الإجمالي',
    amountPaid: 'المبلغ المدفوع',
    dueDate: 'تاريخ الاستحقاق',
    viewAll: 'عرض الكل',
    uploading: 'جاري الرفع...',
    success: 'نجاح',
    error: 'خطأ'
  }
};

const PatientPortal: React.FC<PatientPortalProps> = ({ patientId, patientName, onLogout, profilePicture }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'appointments' | 'financial' | 'medical' | 'ortho' | 'reminders'>('dashboard');
  const [language, setLanguage] = useState<'en' | 'ar'>('en');

  const t = (key: keyof typeof translations['en']) => translations[language][key] || key;

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  // Mock Data
  const [reminders] = useState<Reminder[]>([
    { id: 'r1', patientId, title: 'Wear Elastics', description: 'Remember to wear your Class II elastics 22 hours a day.', date: '2024-03-21', time: '08:00 AM', type: 'ELASTICS', priority: 'high', isRead: false },
    { id: 'r2', patientId, title: 'Upcoming Appointment', description: 'Adjustment visit tomorrow at 10:30 AM.', date: '2024-03-22', time: '10:30 AM', type: 'APPOINTMENT', priority: 'high', isRead: false },
    { id: 'r3', patientId, title: 'Brush & Floss', description: 'Maintain good hygiene around your brackets.', date: '2024-03-21', time: '08:00 PM', type: 'HYGIENE', priority: 'medium', isRead: true }
  ]);

  const [appointments] = useState<Appointment[]>([
    { id: 'app-1', patientId, caseId: 'c1', date: '2024-03-22', time: '10:30 AM', type: 'Adjustment', doctor: 'Dr. Shady', status: 'scheduled' },
    { id: 'app-2', patientId, caseId: 'c1', date: '2024-02-15', time: '11:00 AM', type: 'Wire Change', doctor: 'Dr. Shady', status: 'completed' }
  ]);

  const [invoices] = useState<Invoice[]>([
    { id: 'inv-1', patientId, date: '2024-03-01', dueDate: '2024-03-15', totalAmount: 1500, paidAmount: 1500, status: 'PAID', items: [{ description: 'Monthly Installment - March', amount: 1500 }] },
    { id: 'inv-2', patientId, date: '2024-04-01', dueDate: '2024-04-15', totalAmount: 1500, paidAmount: 0, status: 'UNPAID', items: [{ description: 'Monthly Installment - April', amount: 1500 }] }
  ]);

  const [payments] = useState<Payment[]>([
    { id: 'pay-1', patientId, invoiceId: 'inv-1', date: '2024-03-10', amount: 1500, method: 'CARD', reference: 'TXN-9988' }
  ]);

  const [questionnaires] = useState<MedicalQuestionnaire[]>([
    { id: 'q1', patientId, title: 'Initial Medical History', date: '2024-01-10', status: 'COMPLETED', questions: [{ question: 'Any allergies?', answer: 'None' }, { question: 'Current medications?', answer: 'Vitamins' }] },
    { id: 'q2', patientId, title: 'COVID-19 Screening', date: '2024-03-21', status: 'PENDING', questions: [{ question: 'Fever in last 24h?', answer: '' }] }
  ]);

  const [medicationPhotos, setMedicationPhotos] = useState<MedicationPhoto[]>([
    { id: 'mp1', patientId, url: 'https://picsum.photos/seed/med1/400/300', label: 'Multivitamin', date: '2024-01-15' }
  ]);

  const [progressPhotos, setProgressPhotos] = useState<PhotoRecord[]>([
    { id: 'pp1', type: 'progress', label: 'Week 12 - Frontal', url: 'https://picsum.photos/seed/prog1/800/600', aspectRatio: '4:3', orientation: 'landscape', flipH: false, flipV: false, crop: null },
    { id: 'pp2', type: 'progress', label: 'Week 12 - Right', url: 'https://picsum.photos/seed/prog2/800/600', aspectRatio: '4:3', orientation: 'landscape', flipH: false, flipV: false, crop: null }
  ]);

  const renderDashboard = () => (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
              <Calendar className="w-5 h-5" />
            </div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{t('nextVisit')}</h3>
          </div>
          <p className="text-lg font-black text-slate-900">{language === 'ar' ? '22 مارس 2024' : 'March 22, 2024'}</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">10:30 AM · {language === 'ar' ? 'تعديل' : 'Adjustment'}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
              <DollarSign className="w-5 h-5" />
            </div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{t('balanceDue')}</h3>
          </div>
          <p className="text-lg font-black text-slate-900">$1,500.00</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">{language === 'ar' ? 'مستحق بحلول 15 أبريل' : 'Due by April 15'}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
              <Smile className="w-5 h-5" />
            </div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{t('treatmentProgress')}</h3>
          </div>
          <p className="text-lg font-black text-slate-900">{language === 'ar' ? 'الأسبوع 14' : 'Week 14'}</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">{language === 'ar' ? 'مرحلة المحاذاة' : 'Alignment Phase'}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-600" />
            {t('remindersTasks')}
          </h3>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{reminders.filter(r => !r.isRead).length} {language === 'ar' ? 'جديد' : 'New'}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {reminders.map(reminder => (
            <div key={reminder.id} className={`p-6 flex items-start gap-4 hover:bg-slate-50 transition-colors ${!reminder.isRead ? 'bg-blue-50/30' : ''}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                reminder.type === 'ELASTICS' ? 'bg-purple-100 text-purple-600' :
                reminder.type === 'APPOINTMENT' ? 'bg-blue-100 text-blue-600' :
                'bg-emerald-100 text-emerald-600'
              }`}>
                {reminder.type === 'ELASTICS' ? <Smile className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{reminder.title}</h4>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(reminder.date).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'default')}</span>
                </div>
                <p className="text-xs font-medium text-slate-500 leading-relaxed">{reminder.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderFinancial = () => (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            {t('invoices')}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className={`px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest ${language === 'ar' ? 'text-right' : ''}`}>Invoice #</th>
                <th className={`px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest ${language === 'ar' ? 'text-right' : ''}`}>{t('totalAmount')}</th>
                <th className={`px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest ${language === 'ar' ? 'text-right' : ''}`}>{t('dueDate')}</th>
                <th className={`px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest ${language === 'ar' ? 'text-right' : ''}`}>Status</th>
                <th className={`px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest ${language === 'ar' ? 'text-right' : ''}`}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map(invoice => (
                <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-xs font-bold text-slate-700">{invoice.id}</td>
                  <td className="px-6 py-4 text-xs font-black text-slate-900">${invoice.totalAmount.toFixed(2)}</td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-500">{invoice.dueDate}</td>
                  <td className="px-6 py-4">
                    <span className={`text-[9px] font-black px-2 py-1 rounded-full border uppercase tracking-wider ${
                      invoice.status === 'PAID' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' :
                      invoice.status === 'OVERDUE' ? 'text-rose-600 bg-rose-50 border-rose-100' :
                      'text-amber-600 bg-amber-50 border-amber-100'
                    }`}>
                      {t(invoice.status.toLowerCase() as any)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                      <Download className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            {t('paymentHistory')}
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {payments.map(payment => (
            <div key={payment.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{payment.method} {language === 'ar' ? 'دفع' : 'Payment'}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{payment.date} · Ref: {payment.reference}</p>
                </div>
              </div>
              <span className="text-sm font-black text-emerald-600">+ ${payment.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderMedical = () => (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            {t('medicalQuestionnaires')}
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {questionnaires.map(q => (
            <div key={q.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{q.title}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{q.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-[9px] font-black px-2 py-1 rounded-full border uppercase tracking-wider ${
                  q.status === 'COMPLETED' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-amber-600 bg-amber-50 border-amber-100'
                }`}>
                  {t(q.status.toLowerCase() as any)}
                </span>
                <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-200 transition-all">
                  {q.status === 'COMPLETED' ? (language === 'ar' ? 'عرض' : 'View') : (language === 'ar' ? 'ابدأ' : 'Start')}
                  <ChevronRight className={`w-3 h-3 ${language === 'ar' ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Camera className="w-4 h-4 text-purple-600" />
              {t('medicationPhotos')}
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{language === 'ar' ? 'قم برفع صور لأدويتك الحالية' : 'Upload photos of your current medications'}</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-all shadow-md shadow-purple-100">
            <Plus className="w-4 h-4" />
            {t('addPhoto')}
          </button>
        </div>
        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {medicationPhotos.map(photo => (
            <div key={photo.id} className="group relative aspect-square bg-slate-50 rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all">
              <img src={photo.url} alt={photo.label} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 text-center">
                <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1">{photo.label}</p>
                <p className="text-[8px] font-bold text-white/60 uppercase tracking-wider">{photo.date}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderOrtho = () => (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Smile className="w-4 h-4 text-blue-600" />
              {t('progressPhotos')}
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{language === 'ar' ? 'تتبع تحول ابتسامتك' : 'Track your smile transformation'}</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100">
            <Plus className="w-4 h-4" />
            {t('addPhoto')}
          </button>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {progressPhotos.map(photo => (
            <div key={photo.id} className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm group">
              <div className="aspect-[4/3] relative overflow-hidden">
                <img src={photo.url} alt={photo.label} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <div className={`absolute top-4 ${language === 'ar' ? 'right-4' : 'left-4'}`}>
                  <span className="px-3 py-1 bg-white/90 backdrop-blur-sm rounded-full text-[9px] font-black text-slate-800 uppercase tracking-widest shadow-sm">
                    {photo.label}
                  </span>
                </div>
              </div>
              <div className="p-4 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">2 {language === 'ar' ? 'تعليقات' : 'Comments'}</span>
                </div>
                <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                  <ChevronRight className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <History className="w-4 h-4 text-amber-600" />
            {t('treatmentHistory')}
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {appointments.filter(a => a.status === 'completed').map(app => (
            <div key={app.id} className="p-6 flex items-start gap-4 hover:bg-slate-50 transition-colors">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{app.type}</h4>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{app.date}</span>
                </div>
                <p className="text-xs font-medium text-slate-500 leading-relaxed">{language === 'ar' ? 'تم بواسطة' : 'Performed by'} {app.doctor}. {language === 'ar' ? 'مرحلة المحاذاة تتقدم كما هو مخطط لها.' : 'Alignment phase progressing as planned.'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAppointments = () => (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            {t('upcomingAppts')}
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {appointments.filter(a => a.status === 'scheduled').map(app => (
            <div key={app.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex flex-col items-center justify-center text-blue-600">
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">{new Date(app.date).toLocaleString(language === 'ar' ? 'ar-EG' : 'default', { month: 'short' })}</span>
                  <span className="text-lg font-black leading-none">{new Date(app.date).getDate()}</span>
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{app.type}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{app.time} · {app.doctor}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 transition-all">{t('reschedule')}</button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-blue-700 transition-all shadow-md shadow-blue-100">{t('confirm')}</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            {t('pastAppts')}
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {appointments.filter(a => a.status === 'completed').map(app => (
            <div key={app.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex flex-col items-center justify-center text-slate-400">
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">{new Date(app.date).toLocaleString(language === 'ar' ? 'ar-EG' : 'default', { month: 'short' })}</span>
                  <span className="text-lg font-black leading-none">{new Date(app.date).getDate()}</span>
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{app.type}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{app.time} · {app.doctor}</p>
                </div>
              </div>
              <span className="text-[9px] font-black px-2 py-1 rounded-full border border-emerald-100 text-emerald-600 bg-emerald-50 uppercase tracking-wider">{t('completed')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderReminders = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">{t('remindersTasks')}</h2>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md shadow-blue-100">
          <Plus className="w-3 h-3" />
          {t('addReminder')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reminders.map((reminder) => (
          <div key={reminder.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  reminder.type === 'APPOINTMENT' ? 'bg-blue-50 text-blue-600' :
                  reminder.type === 'MEDICATION' ? 'bg-emerald-50 text-emerald-600' :
                  reminder.type === 'HYGIENE' ? 'bg-amber-50 text-amber-600' :
                  'bg-purple-50 text-purple-600'
                }`}>
                  {reminder.type === 'APPOINTMENT' && <Calendar className="w-6 h-6" />}
                  {reminder.type === 'MEDICATION' && <Pill className="w-6 h-6" />}
                  {reminder.type === 'HYGIENE' && <Activity className="w-6 h-6" />}
                  {reminder.type === 'ELASTICS' && <Smile className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">{reminder.title}</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t(reminder.type.toLowerCase() as any)}</p>
                </div>
              </div>
              <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                reminder.priority === 'high' ? 'bg-rose-50 text-rose-600' :
                reminder.priority === 'medium' ? 'bg-amber-50 text-amber-600' :
                'bg-slate-50 text-slate-400'
              }`}>
                {reminder.priority}
              </div>
            </div>
            
            <p className="text-xs text-slate-600 font-medium mb-4 leading-relaxed">{reminder.description}</p>
            
            <div className="flex items-center justify-between pt-4 border-t border-slate-50">
              <div className="flex items-center gap-2 text-slate-400">
                <Clock className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-widest">{reminder.time}</span>
              </div>
              <button className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-700 transition-colors">
                {t('markAsDone')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <h3 className="text-lg font-black uppercase tracking-tight mb-2">{t('notificationSettings')}</h3>
          <p className="text-sm text-slate-400 font-medium mb-6 max-w-md">{t('notificationDesc')}</p>
          
          <div className="space-y-4 max-w-sm">
            {[
              { label: t('pushNotifications'), active: true },
              { label: t('emailReminders'), active: true },
              { label: t('smsAlerts'), active: false }
            ].map((setting, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                <span className="text-xs font-bold uppercase tracking-widest">{setting.label}</span>
                <div className={`w-10 h-5 rounded-full relative transition-colors ${setting.active ? 'bg-blue-500' : 'bg-slate-700'}`}>
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${setting.active ? (language === 'ar' ? 'left-1' : 'right-1') : (language === 'ar' ? 'right-1' : 'left-1')}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans text-slate-900">
      {/* Portal Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200 overflow-hidden">
            {profilePicture ? (
              <img src={profilePicture} alt={patientName} className="w-full h-full object-cover" />
            ) : (
              <Smile className="w-6 h-6" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 leading-none mb-1">Patient Portal</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{t('welcomeBack')}, {patientName}</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setLanguage('en')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${language === 'en' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
            >
              EN
            </button>
            <button 
              onClick={() => setLanguage('ar')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${language === 'ar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
            >
              AR
            </button>
          </div>

          <div className={`flex items-center gap-3 pr-6 border-r border-slate-100 ${language === 'ar' ? 'pr-0 pl-6 border-r-0 border-l' : ''}`}>
            <div className={language === 'ar' ? 'text-left' : 'text-right'}>
              <p className="text-xs font-black text-slate-800 uppercase tracking-wider">{patientName}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('patientId')}: {patientId}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border-2 border-white shadow-sm">
              <User className="w-5 h-5" />
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
          >
            <LogOut className={`w-5 h-5 ${language === 'ar' ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className={`w-64 bg-white border-r border-slate-200 flex flex-col p-6 gap-2 ${language === 'ar' ? 'border-r-0 border-l' : ''}`}>
          <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutGrid className="w-4 h-4" />} label={t('dashboard')} language={language} />
          <NavButton active={activeTab === 'appointments'} onClick={() => setActiveTab('appointments')} icon={<Calendar className="w-4 h-4" />} label={t('appointments')} language={language} />
          <NavButton active={activeTab === 'financial'} onClick={() => setActiveTab('financial')} icon={<DollarSign className="w-4 h-4" />} label={t('financial')} language={language} />
          <NavButton active={activeTab === 'medical'} onClick={() => setActiveTab('medical')} icon={<Stethoscope className="w-4 h-4" />} label={t('medical')} language={language} />
          <NavButton active={activeTab === 'ortho'} onClick={() => setActiveTab('ortho')} icon={<Smile className="w-4 h-4" />} label={t('ortho')} language={language} />
          <NavButton active={activeTab === 'reminders'} onClick={() => setActiveTab('reminders')} icon={<Bell className="w-4 h-4" />} label={t('reminders')} language={language} />
          
          <div className="mt-auto pt-6 border-t border-slate-100">
            <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">{t('needHelp')}</p>
              <p className="text-[10px] font-medium text-blue-500 leading-relaxed mb-3">{t('contactClinic')}</p>
              <button className="w-full py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md shadow-blue-100">{t('callClinic')}</button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-5xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'dashboard' && renderDashboard()}
                {activeTab === 'appointments' && renderAppointments()}
                {activeTab === 'financial' && renderFinancial()}
                {activeTab === 'medical' && renderMedical()}
                {activeTab === 'ortho' && renderOrtho()}
                {activeTab === 'reminders' && renderReminders()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
};

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  language: 'en' | 'ar';
}

const NavButton: React.FC<NavButtonProps> = ({ active, onClick, icon, label, language }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${language === 'ar' ? 'text-right' : 'text-left'} ${
      active 
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' 
        : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
    }`}
  >
    {icon}
    {label}
  </button>
);

const LayoutGrid = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);

export default PatientPortal;
