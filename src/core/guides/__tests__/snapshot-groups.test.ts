import { describe, expect, it } from 'vitest';
import { groupSnapshots } from '../snapshot-groups';
import type { Snapshot } from '../types';

function snap(id: string, contentHash: string): Snapshot {
  return { id, guideId: 'g1', createdAt: 0, contentHash, title: '', stepIds: [], steps: [], screenshots: [] };
}

describe('groupSnapshots', () => {
  it('returns a plain entry for a lone hash', () => {
    expect(groupSnapshots([snap('a', 'h1')])).toEqual([{ kind: 'entry', snapshot: snap('a', 'h1') }]);
  });

  it('collapses a run of matching hashes into one group', () => {
    const rows = groupSnapshots([snap('a', 'h1'), snap('b', 'h1'), snap('c', 'h1')]);

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('group');
    expect(rows[0].kind === 'group' && rows[0].snapshots).toHaveLength(3);
  });

  it('keeps runs separate and preserves order', () => {
    const rows = groupSnapshots([snap('a', 'h1'), snap('b', 'h2'), snap('c', 'h2'), snap('d', 'h3')]);

    expect(rows.map((r) => r.kind)).toEqual(['entry', 'group', 'entry']);
  });

  it('preserves snapshot identity and order across rows', () => {
    const rows = groupSnapshots([snap('a', 'h1'), snap('b', 'h2'), snap('c', 'h2'), snap('d', 'h3')]);

    expect(rows[0].kind === 'entry' && rows[0].snapshot.id).toBe('a');
    expect(rows[1].kind === 'group' && rows[1].snapshots.map((s) => s.id)).toEqual(['b', 'c']);
    expect(rows[2].kind === 'entry' && rows[2].snapshot.id).toBe('d');
  });

  it('does not merge non-adjacent matching hashes', () => {
    const rows = groupSnapshots([snap('a', 'h1'), snap('b', 'h2'), snap('c', 'h1')]);

    expect(rows.map((r) => r.kind)).toEqual(['entry', 'entry', 'entry']);
  });

  it('returns nothing for an empty list', () => {
    expect(groupSnapshots([])).toEqual([]);
  });
});
