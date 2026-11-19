export function assignmentMatchesPrincipal(
  assignment: { userId: string | null; unitId: string | null },
  userId: string,
  unitIds: string[]
): boolean {
  return assignment.userId === userId ||
    (assignment.unitId !== null && unitIds.includes(assignment.unitId));
}
