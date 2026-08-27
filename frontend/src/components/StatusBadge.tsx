const COLOR_MAP: Record<string, string> = {
  draft: 'bg-stone-200 text-stone-700',
  planned: 'bg-stone-200 text-stone-700',
  planning: 'bg-stone-200 text-stone-700',
  pending: 'bg-stone-200 text-stone-700',
  unpaid: 'bg-rose-100 text-rose-700',
  confirmed: 'bg-sky-100 text-sky-700',
  ordered: 'bg-sky-100 text-sky-700',
  booked: 'bg-sky-100 text-sky-700',
  in_progress: 'bg-amber-100 text-amber-700',
  in_production: 'bg-amber-100 text-amber-700',
  quality_check: 'bg-amber-100 text-amber-700',
  loading: 'bg-amber-100 text-amber-700',
  partial: 'bg-amber-100 text-amber-700',
  in_transit: 'bg-indigo-100 text-indigo-700',
  ready_to_ship: 'bg-indigo-100 text-indigo-700',
  received: 'bg-emerald-100 text-emerald-700',
  shipped: 'bg-emerald-100 text-emerald-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-emerald-100 text-emerald-700',
  paid: 'bg-emerald-100 text-emerald-700',
  passed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-rose-100 text-rose-700',
  overdue: 'bg-rose-100 text-rose-700',
  failed: 'bg-rose-100 text-rose-700',
};

export function StatusBadge({ status }: { status: string }) {
  const classes = COLOR_MAP[status] || 'bg-stone-200 text-stone-700';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${classes}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}
