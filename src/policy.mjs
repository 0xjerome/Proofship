export function decidePolicy({ deploymentReady, checks, diagnosis }) {
  const failed = checks.filter((c) => !c.passed);
  if (!deploymentReady) return { status: 'blocked', action: 'investigate', reason: 'Deployment is not READY.' };
  if (failed.length > 0) {
    const canRollback = diagnosis?.recommendedAction === 'rollback' || failed.some((c) => c.critical !== false);
    return { status: 'failed', action: canRollback ? 'rollback' : 'investigate', reason: `${failed.length} production acceptance check(s) failed.` };
  }
  return { status: 'verified', action: 'approve', reason: 'Infrastructure and all production acceptance checks passed.' };
}
