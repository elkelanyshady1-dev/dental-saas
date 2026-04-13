// Mock data for development — matches backend supervisor module schema

export const MOCK_SUPERVISOR = {
  _id: 'sup_001',
  name: 'Prof. Sarah Connor, PhD',
  email: 's.connor@mayo.edu',
  title: 'Senior Clinical Supervisor',
  institution: 'Mayo Clinic Rochester',
  isActive: true,
  createdAt: '2024-01-15T00:00:00Z',
}

export const MOCK_STATS = {
  totalCases: 48,
  pendingReviewCount: 12,
  approvedCount: 1204,
  byOrganization: {
    'Cairo University': 32,
    'Ain Shams Medical': 16,
  },
  byStatus: {
    active: 48,
    completed: 1204,
  },
}

export const MOCK_CASES = [
  {
    _id: 'ca_001',
    caseId: { _id: 'case_001', patientId: { name: 'Ahmed Al-Rashid' }, status: 'active', caseType: 'Class II Div 1', malocclusionClass: 'Class II', createdAt: '2024-03-20T08:00:00Z', updatedAt: '2024-03-22T14:30:00Z', workflowData: { currentStep: 'DIAGNOSIS' } },
    organizationId: 'org_001',
    organization: { name: 'Cairo University', country: 'EG' },
    role: 'SUPERVISOR',
    permissions: { canComment: true, canApprove: true, canViewAnalysis: true, canDownload: false },
    status: 'ACTIVE',
    studentName: 'Dr. Sara Ahmed',
    studentYear: 'Year 3 Resident',
  },
  {
    _id: 'ca_002',
    caseId: { _id: 'case_002', patientId: { name: 'Mariam Khalil' }, status: 'active', caseType: 'Class I Crowding', malocclusionClass: 'Class I', createdAt: '2024-03-18T10:00:00Z', updatedAt: '2024-03-22T11:00:00Z', workflowData: { currentStep: 'TREATMENT_PLAN' } },
    organizationId: 'org_001',
    organization: { name: 'Cairo University', country: 'EG' },
    role: 'SUPERVISOR',
    permissions: { canComment: true, canApprove: true, canViewAnalysis: true, canDownload: true },
    status: 'ACTIVE',
    studentName: 'Dr. Omar Hassan',
    studentYear: 'Year 2 Resident',
  },
  {
    _id: 'ca_003',
    caseId: { _id: 'case_003', patientId: { name: 'Sarah Jenkins' }, status: 'active', caseType: 'Open Bite', malocclusionClass: 'Class III', createdAt: '2024-03-15T09:00:00Z', updatedAt: '2024-03-21T16:45:00Z', workflowData: { currentStep: 'PROGRESS' } },
    organizationId: 'org_002',
    organization: { name: 'Ain Shams Medical', country: 'EG' },
    role: 'SUPERVISOR',
    permissions: { canComment: true, canApprove: true, canViewAnalysis: true, canDownload: false },
    status: 'ACTIVE',
    studentName: 'Dr. Elena Rodriguez',
    studentYear: 'Year 4 Resident',
  },
  {
    _id: 'ca_004',
    caseId: { _id: 'case_004', patientId: { name: 'Marcus Miller' }, status: 'completed', caseType: 'Class II Div 2', malocclusionClass: 'Class II', createdAt: '2024-02-01T08:00:00Z', updatedAt: '2024-03-20T10:00:00Z', workflowData: { currentStep: 'FINISHING' } },
    organizationId: 'org_002',
    organization: { name: 'Ain Shams Medical', country: 'EG' },
    role: 'SUPERVISOR',
    permissions: { canComment: true, canApprove: true, canViewAnalysis: true, canDownload: true },
    status: 'ACTIVE',
    studentName: 'Dr. Sarah Chen',
    studentYear: 'Year 3 Resident',
  },
]

export const MOCK_REVIEWS = [
  {
    _id: 'rev_001',
    caseId: 'case_001',
    stageType: 'DIAGNOSIS',
    stageNumber: 1,
    status: 'PENDING',
    requestedBy: { name: 'Dr. Sara Ahmed', email: 'sara@cairo.edu' },
    requestedAt: '2024-03-22T09:45:00Z',
  },
  {
    _id: 'rev_002',
    caseId: 'case_002',
    stageType: 'TREATMENT_PLAN',
    stageNumber: 1,
    status: 'IN_REVIEW',
    requestedBy: { name: 'Dr. Omar Hassan', email: 'omar@cairo.edu' },
    requestedAt: '2024-03-21T14:00:00Z',
    reviewedBy: { name: 'Prof. Sarah Connor' },
  },
  {
    _id: 'rev_003',
    caseId: 'case_003',
    stageType: 'PROGRESS',
    stageNumber: 2,
    status: 'REVISION_REQUESTED',
    requestedBy: { name: 'Dr. Elena Rodriguez', email: 'elena@ainshams.edu' },
    requestedAt: '2024-03-20T11:00:00Z',
    reviewedBy: { name: 'Prof. Sarah Connor' },
    reviewedAt: '2024-03-20T15:30:00Z',
    decisionNote: 'Mesial drift on lower left canine — please re-evaluate anchorage protocol.',
  },
]

export const MOCK_COMMENTS = [
  {
    _id: 'com_001',
    reviewStageId: 'rev_001',
    authorType: 'DOCTOR',
    authorName: 'Dr. Sara Ahmed',
    type: 'COMMENT',
    content: 'Initial diagnosis complete. Cephalometric analysis shows ANB angle of 6°, consistent with skeletal Class II. Please review the proposed treatment plan.',
    createdAt: '2024-03-22T09:50:00Z',
  },
  {
    _id: 'com_002',
    reviewStageId: 'rev_001',
    authorType: 'SUPERVISOR',
    authorName: 'Prof. Sarah Connor',
    type: 'QUESTION',
    content: 'Good analysis. What is the Wits appraisal value? Also, have you considered the vertical dimension — I see potential open bite tendency on the lateral ceph.',
    createdAt: '2024-03-22T10:15:00Z',
  },
  {
    _id: 'com_003',
    reviewStageId: 'rev_001',
    authorType: 'DOCTOR',
    authorName: 'Dr. Sara Ahmed',
    type: 'COMMENT',
    content: 'Wits appraisal is +4mm. You\'re right about the vertical tendency — FMA is 32°. I\'ll revise the plan to include vertical control mechanics.',
    createdAt: '2024-03-22T10:45:00Z',
  },
]

export const MOCK_INVITATIONS = [
  {
    _id: 'inv_001',
    caseId: { _id: 'case_new_1', patientId: { name: 'Yara Mahmoud' }, caseType: 'Class III Surgical' },
    organizationId: 'org_003',
    inviteeEmail: 's.connor@mayo.edu',
    invitedBy: { name: 'Dr. Sarah Miller' },
    status: 'PENDING',
    role: 'SUPERVISOR',
    permissions: { canComment: true, canApprove: true, canViewAnalysis: true, canDownload: false },
    createdAt: '2024-03-22T08:00:00Z',
    expiresAt: '2024-03-25T08:00:00Z',
    institution: 'Kings College Dental',
  },
  {
    _id: 'inv_002',
    caseId: { _id: 'case_new_2', patientId: { name: 'David Park' }, caseType: 'Impacted Canines' },
    organizationId: 'org_004',
    inviteeEmail: 's.connor@mayo.edu',
    invitedBy: { name: 'Dr. Arthur Lin' },
    status: 'PENDING',
    role: 'SUPERVISOR',
    permissions: { canComment: true, canApprove: true, canViewAnalysis: true, canDownload: true },
    createdAt: '2024-03-21T15:00:00Z',
    expiresAt: '2024-03-24T15:00:00Z',
    institution: 'Stanford Medical Center',
  },
]

export const MOCK_ACTIVITY = [
  { id: 1, type: 'submission', message: 'Dr. Sara submitted diagnosis for Case #124', time: 'Today, 09:45 AM', caseRef: '#124' },
  { id: 2, type: 'approval', message: 'Approval granted for Case #119', time: 'Today, 08:20 AM', caseRef: '#119' },
  { id: 3, type: 'join', message: 'New resident Dr. Leila joined Cairo University portal', time: 'Yesterday, 04:30 PM' },
  { id: 4, type: 'revision', message: 'Case #120: Treatment plan revised by Dr. Omar', time: 'Yesterday, 02:15 PM', caseRef: '#120' },
]

export function getStageLabel(stage) {
  const map = {
    DIAGNOSIS: 'Diagnosis',
    TREATMENT_PLAN: 'Treatment Plan',
    PROGRESS: 'Progress',
    FINISHING: 'Finishing',
  }
  return map[stage] || stage
}

export function getStatusColor(status) {
  const map = {
    PENDING: 'badge-pending',
    IN_REVIEW: 'badge-revision',
    APPROVED: 'badge-approved',
    REJECTED: 'badge-rejected',
    REVISION_REQUESTED: 'badge-revision',
  }
  return map[status] || 'badge-pending'
}

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
