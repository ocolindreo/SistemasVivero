const ADMINISTRATIVE_LOCK_ATTEMPTS = 9;

const TEMPORARY_LOCKS = new Map([
  [3, 60],
  [5, 10 * 60],
  [7, 60 * 60]
]);

function getLockPolicy(failedAttempts) {
  if (failedAttempts >= ADMINISTRATIVE_LOCK_ATTEMPTS) {
    return { administrative: true, seconds: null };
  }

  const seconds = TEMPORARY_LOCKS.get(failedAttempts) || null;
  return { administrative: false, seconds };
}

function getRemainingSeconds(lockedUntil, now = new Date()) {
  if (!lockedUntil) return 0;
  return Math.max(0, Math.ceil((new Date(lockedUntil).getTime() - now.getTime()) / 1000));
}

module.exports = {
  ADMINISTRATIVE_LOCK_ATTEMPTS,
  getLockPolicy,
  getRemainingSeconds
};
