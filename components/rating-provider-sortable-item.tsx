'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { RatingPreference } from '@/lib/ratingProviderCatalog';
import type { RatingProviderRow } from '@/lib/ratingProviderRows';
import {
  getDragPreviewClassName,
  getPositionChipClassName,
  getProviderLabel,
  getRowShellClassName,
} from '@/lib/ratingProviderSortableListUi';

type SortableRatingProviderItemProps = {
  row: RatingProviderRow;
  position: number;
  onToggle: (providerId: RatingPreference) => void;
};

export function SortableRatingProviderItem({
  row,
  position,
  onToggle,
}: SortableRatingProviderItemProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: row.id,
    transition: {
      duration: 220,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={getRowShellClassName(row.enabled, isDragging)}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${getProviderLabel(row.id)}`}
        className="shrink-0 cursor-grab rounded-md p-1 text-zinc-500 transition-colors hover:text-violet-300 active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 select-none">
        <input
          type="checkbox"
          checked={row.enabled}
          onChange={() => onToggle(row.id)}
          className="h-3 w-3 shrink-0 accent-violet-500"
        />
        <span className="truncate">{getProviderLabel(row.id)}</span>
      </label>
      <span className={getPositionChipClassName(row.enabled)} aria-label={`Position ${position}`}>
        {position}
      </span>
    </li>
  );
}

export function RatingProviderDragPreview({ row }: { row: RatingProviderRow }) {
  return (
    <div className={getDragPreviewClassName(row.enabled)}>
      <GripVertical className="h-4 w-4 shrink-0 text-violet-300" />
      <span className="truncate text-xs font-medium">{getProviderLabel(row.id)}</span>
    </div>
  );
}
