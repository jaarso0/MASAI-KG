export type StructuralRole = 'anchor' | 'path' | 'direct_neighbor' | 'transitive_neighbor' | 'impacted';

export const ROLE_PRIORITIES: Record<StructuralRole, number> = {
  anchor: 100,
  path: 80,
  impacted: 70,
  direct_neighbor: 50,
  transitive_neighbor: 20
};

export function getRolePriority(role: StructuralRole): number {
  return ROLE_PRIORITIES[role] || 0;
}
