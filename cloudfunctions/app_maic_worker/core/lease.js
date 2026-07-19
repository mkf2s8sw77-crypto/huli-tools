function canAcquireLease(runtime, nowMs) {
  if (!runtime || !runtime.leaseOwner) return true;
  const expiresAt = runtime.leaseExpiresAt ? new Date(runtime.leaseExpiresAt).getTime() : 0;
  return !expiresAt || expiresAt <= nowMs;
}

function isLeaseExpired(task, nowMs) {
  const expiresAt = task && task.leaseExpiresAt ? new Date(task.leaseExpiresAt).getTime() : 0;
  return Boolean(expiresAt && expiresAt <= nowMs);
}

module.exports = { canAcquireLease, isLeaseExpired };
