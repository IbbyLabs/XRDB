'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { createPortal } from 'react-dom';
import { useMemo, useState } from 'react';
import type { RatingPreference } from '@/lib/ratingProviderCatalog';
import type { RatingProviderRow } from '@/lib/ratingProviderRows';
import {
  findActiveRatingProviderRow,
  buildRatingProviderGridStyle,
  resolveRatingProviderReorder,
} from '@/lib/ratingProviderSortableListUi';
import {
  RatingProviderDragPreview,
  SortableRatingProviderItem,
} from '@/components/rating-provider-sortable-item';

export type RatingProviderSortableListProps = {
  rows: RatingProviderRow[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onToggle: (providerId: RatingPreference) => void;
  fillDirection?: 'row' | 'column';
};

const DROP_ANIMATION = {
  duration: 220,
  easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: { opacity: '0.35' },
    },
  }),
};

export function RatingProviderSortableList({
  rows,
  onReorder,
  onToggle,
  fillDirection = 'row',
}: RatingProviderSortableListProps) {
  const [activeId, setActiveId] = useState<RatingPreference | null>(null);
  const itemIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const listStyle = buildRatingProviderGridStyle(fillDirection, rows.length);
  const overlayRoot = typeof document === 'undefined' ? null : document.body;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeRow = findActiveRatingProviderRow(rows, activeId);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as RatingPreference);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    const reorder = resolveRatingProviderReorder(rows, String(active.id), over?.id ? String(over.id) : null);
    if (!reorder) {
      return;
    }

    onReorder(reorder.fromIndex, reorder.toIndex);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={itemIds} strategy={rectSortingStrategy}>
        <ul
          className="grid grid-cols-1 gap-x-3 gap-y-2 pr-0.5 sm:grid-cols-2 [touch-action:pan-y]"
          style={listStyle}
        >
          {rows.map((row, index) => (
            <SortableRatingProviderItem
              key={row.id}
              row={row}
              position={index + 1}
              onToggle={onToggle}
            />
          ))}
        </ul>
      </SortableContext>
      {overlayRoot
        ? createPortal(
            <DragOverlay dropAnimation={DROP_ANIMATION} zIndex={9999}>
              {activeRow ? <RatingProviderDragPreview row={activeRow} /> : null}
            </DragOverlay>,
            overlayRoot
          )
        : null}
    </DndContext>
  );
}
