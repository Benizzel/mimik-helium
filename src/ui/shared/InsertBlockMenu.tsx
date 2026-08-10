import { Heading, Plus, StickyNote } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { i18n } from '#imports';
import type { BlockType } from '@/core/guides/types';

interface InsertBlockMenuProps {
  onInsert: (blockType: BlockType) => void;
}

export default function InsertBlockMenu({ onInsert }: InsertBlockMenuProps) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const choices = [
    { type: 'heading' as const, icon: Heading, label: i18n.t('blocks.heading') },
    { type: 'callout' as const, icon: StickyNote, label: i18n.t('blocks.callout') },
  ];

  return (
    <div
      ref={rowRef}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return;
        setOpen(false);
        triggerRef.current?.focus();
      }}
      className="group relative flex items-center justify-center gap-1 h-6 my-1"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-1/2 border-t border-dashed border-border transition-opacity ${open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
      />
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((prev) => !prev)}
        title={i18n.t('blocks.add')}
        aria-label={i18n.t('blocks.add')}
        aria-expanded={open}
        className={`relative flex items-center justify-center w-5 h-5 rounded-full border border-border bg-card text-purple transition-opacity hover:text-accent focus-visible:opacity-100 group-hover:opacity-100 ${open ? 'opacity-100 text-accent' : 'opacity-0'}`}
      >
        <Plus size={13} />
      </button>
      {open &&
        choices.map((choice) => (
          <button
            key={choice.type}
            type="button"
            onClick={() => {
              setOpen(false);
              onInsert(choice.type);
            }}
            className="relative flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-purple hover:text-accent hover:bg-secondary"
          >
            <choice.icon size={13} />
            {choice.label}
          </button>
        ))}
    </div>
  );
}
