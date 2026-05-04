export type WorkflowStep = 'integrations' | 'poster' | 'backdrop' | 'thumbnail' | 'logo';

export const WORKFLOW_STEPS: Array<{
  key: WorkflowStep;
  label: string;
  href: string;
  previewLabel?: string;
}> = [
  { key: 'integrations', label: 'Integrations', href: '/integrations' },
  { key: 'poster', label: 'Poster', href: '/poster', previewLabel: 'Poster preview band' },
  { key: 'backdrop', label: 'Backdrop', href: '/backdrop', previewLabel: 'Backdrop preview band' },
  { key: 'thumbnail', label: 'Thumbnail', href: '/thumbnail', previewLabel: 'Thumbnail preview band' },
  { key: 'logo', label: 'Logo', href: '/logo', previewLabel: 'Logo preview band' },
];