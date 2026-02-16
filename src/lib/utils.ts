import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Generate a random hex token of the given byte length */
export function generateToken(bytes: number = 16): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Format a date for display */
export function formatDate(date: string | Date | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Format a date with time */
export function formatDateTime(date: string | Date | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Calculate percentage complete */
export function calcProgress(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

/** Status color mapping */
export function statusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'active':
    case 'in_progress':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'waiting_client':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'paused':
      return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    case 'cancelled':
    case 'declined':
      return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'draft':
    case 'pending':
      return 'bg-slate-500/10 text-slate-600 border-slate-500/20';
    case 'signed':
      return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'sent':
    case 'viewed':
      return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    default:
      return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
  }
}

/** Category label mapping */
export function categoryLabel(category: string): string {
  switch (category) {
    case 'documents': return 'Documents';
    case 'setup': return 'Setup';
    case 'signatures': return 'Signatures';
    case 'review': return 'Review';
    case 'financial': return 'Financial';
    case 'communication': return 'Communication';
    default: return category;
  }
}
