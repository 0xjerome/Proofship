export function decidePolicy({ deploymentReady, checks, diagnosis }) {
  const allChecks = Array.isArray(checks) ? checks : [];
  if (!deploymentReady) {
    return { status: 'blocked', action: 'investigate', reason: 'Deployment is not READY.' };
  }
  if (allChecks.length === 0) {
    return { status: 'blocked', action: 'configure_checks', reason: 'No production acceptance checks were configured.' };
  }
  const failed = allChecks.filter((check) => !check.passed);
  if (failed.length > 0) {
    const canRollback = diagnosis?.recommendedAction === 'rollback' || failed.some((check) => check.critical !== false);
    return {
      status: 'failed',
      action: canRollback ? 'rollback' : 'investigate',
      reason: `${failed.length} production acceptance check(s) failed.`
    };
  }
  return {
    status: 'verified',
    action: 'approve',
    reason: 'Infrastructure and all production acceptance checks passed.'
  };
}
