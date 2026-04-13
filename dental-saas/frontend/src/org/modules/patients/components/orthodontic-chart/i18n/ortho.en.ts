/**
 * ortho.en.ts — English translations for the Orthodontic Chart module
 *
 * Usage: Import and register with i18next, then use via useTranslation('ortho')
 * Pattern: const { t } = useTranslation('ortho');
 *          t('case.status.active') → "Active Treatment"
 */

const orthoEn = {
  case: {
    status: {
      draft: 'Draft',
      diagnosis: 'Diagnosis',
      treatment_planning: 'Treatment Planning',
      active: 'Active Treatment',
      completed: 'Completed',
      cancelled: 'Cancelled',
    },
    malocclusion: {
      CLASS_I: 'Class I',
      CLASS_II_DIV_1: 'Class II Div.1',
      CLASS_II_DIV_2: 'Class II Div.2',
      CLASS_III: 'Class III',
    },
    create: {
      title: 'Create Orthodontic Case',
      patientLabel: 'Select Patient',
      malocclussionLabel: 'Malocclusion Classification',
      estimatedDuration: 'Estimated Duration (months)',
      notesLabel: 'Clinical Notes',
      submit: 'Create Case',
      activeCollision: 'Active Case Exists',
      openExisting: 'Open Existing Case',
    },
  },
  workflow: {
    steps: {
      records: 'Records',
      analysis: 'Analysis',
      problems: 'Problem List',
      goals: 'Goals',
      options: 'Treatment Options',
      finalPlan: 'Final Plan',
    },
    title: 'Treatment Workflow',
  },
  snapshot: {
    save: 'Save Snapshot',
    saving: 'Saving...',
    untitled: 'Untitled Snapshot',
    immutableWarning: 'chartState is immutable and cannot be updated after creation',
    types: {
      diagnostic: 'Diagnostic',
      pretreatment: 'Pre-treatment',
      treatment: 'Treatment',
      'post-treatment': 'Post-treatment',
      compaction: 'Compaction',
    },
  },
  tad: {
    title: 'TAD Management',
    create: 'Insert TAD',
    status: {
      ACTIVE: 'Active',
      NEEDS_REMOVAL: 'Needs Removal',
      FAILED: 'Failed',
      REMOVED: 'Removed',
    },
    actions: {
      markForRemoval: 'Mark for Removal',
      confirmRemoval: 'Confirm Removal',
      recordFailure: 'Record Failure',
      reinsert: 'Reinsert',
    },
    removalReasons: {
      loose: 'Loose',
      pain: 'Patient Pain',
      migration: 'Migration',
      infection: 'Infection',
    },
    failureRate: 'Failure Rate',
    healingWeeks: 'Healing Period (weeks)',
    noTads: 'No TADs placed',
  },
  bonding: {
    apply: 'Apply Bonding',
    debond: 'Debond',
    reposition: 'Reposition',
    rebondNow: 'Rebond Now',
    addTodoReminder: 'Add TODO Reminder',
    prescription: {
      MBT: 'MBT',
      Roth: 'Roth',
      Bidimensional: 'Bidimensional',
      'Standard Edgewise': 'Standard Edgewise',
      Ricketts: 'Ricketts',
    },
    slotSizes: {
      '0.022': '0.022"',
      '0.018': '0.018"',
    },
    actions: {
      bonding: 'Bonding',
      rebonding: 'Rebonding',
      repositioning: 'Repositioning',
    },
    height: 'Bonding Height',
    position: 'Bonding Position',
    positions: {
      'marginal-ridges-level': 'Marginal Ridges Level',
      'middle-middle': 'Middle-Middle',
      custom: 'Custom (mm)',
    },
    type: {
      bracket: 'Bracket',
      band: 'Band',
      'molar-tube': 'Molar Tube',
    },
  },
  todo: {
    title: 'Clinical TODOs',
    create: 'New TODO',
    placeholder: 'Describe the clinical task...',
    priority: {
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    },
    type: {
      rebond: 'Rebond',
      reposition: 'Reposition',
      check: 'Check',
      replace: 'Replace',
      remove: 'Remove',
      followup: 'Follow-up',
      custom: 'Custom',
    },
    status: {
      pending: 'Pending',
      done: 'Done',
    },
    empty: 'No TODOs for this case',
    suggestions: 'Suggested TODOs',
  },
  clinical: {
    archwire: 'Archwire',
    elastic: 'Elastic',
    powerchain: 'Power Chain',
    accessory: 'Accessory',
    ligature: 'Ligature',
    ipr: 'IPR',
    spaceMarker: 'Space Marker',
  },
  records: {
    extraoral: 'Extraoral Photos',
    intraoral: 'Intraoral Photos',
    xrays: 'X-Rays',
    models: 'Study Models',
    upload: 'Upload',
    deletePhoto: 'Delete Photo',
    noPhotos: 'No photos uploaded',
    analyzed: 'Analyzed',
  },
  confirm: {
    deletePhoto: {
      title: 'Delete Photo',
      description: 'This photo will be permanently removed. This action cannot be undone.',
      confirm: 'Delete Photo',
    },
    deleteTodo: {
      title: 'Delete TODO',
      description: 'This clinical task will be removed from the case.',
      confirm: 'Delete',
    },
    deleteCase: {
      title: 'Delete Case',
      description: 'This orthodontic case will be archived. Clinical records will be preserved for medico-legal compliance.',
      confirm: 'Archive Case',
    },
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    confirm: 'Confirm',
    loading: 'Loading...',
    noData: 'No data available',
    error: 'An error occurred',
    retry: 'Retry',
  },
};

export default orthoEn;
export type OrthoTranslations = typeof orthoEn;
