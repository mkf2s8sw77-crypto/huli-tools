const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const TASKS = "app_maic_tasks";
const RUNTIME = "app_maic_runtime";
const ARTIFACTS = "app_maic_artifacts";
const ACTIVE_STATUSES = ["queued", "processing", "importing"];
const TERMINAL_STATUSES = ["failed", "cancelled", "timed_out"];

function makeResponse(ok, dataOrError, requestId) {
  if (ok) return { ok: true, data: dataOrError || {}, requestId };
  return { ok: false, error: dataOrError || { code: "UNKNOWN", message: "未知错误" }, requestId };
}

function getInternalToken() {
  return process.env.INTERNAL_API_SECRET || "";
}

function verifyCaller(event) {
  if (event && (event.Type === "Timer" || event.TriggerName || event.triggerName)) return null;
  const token = getInternalToken();
  if (!token) return { code: "INTERNAL_SECRET_NOT_CONFIGURED", message: "内部调用凭据未配置" };
  if (!event || event._internalToken !== token) return { code: "FORBIDDEN", message: "内部接口，禁止直接调用" };
  return null;
}

function isNotFound(err) {
  return Boolean(err && (err.errCode === -502003 || /not exist|not found/i.test(err.message || "")));
}

async function getDoc(collection, id) {
  try {
    const res = await db.collection(collection).doc(id).get();
    return res.data || null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

function isExpired(value, nowMs) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Boolean(timestamp && timestamp <= nowMs);
}

async function callFailUsage(task) {
  const res = await cloud.callFunction({
    name: "coreApp",
    data: {
      action: "failUsage",
      _internalToken: getInternalToken(),
      userId: task.userId,
      usageId: task.usageId,
      errorCode: task.errorCode || task.status.toUpperCase(),
      errorMessage: task.errorMessage || "MAIC 任务已结束",
    },
  });
  const result = res.result || {};
  if (result.ok) return true;
  const code = result.error && result.error.code;
  if (["USAGE_ALREADY_FAILED", "USAGE_ALREADY_FINISHED"].includes(code)) return true;
  throw Object.assign(new Error((result.error && result.error.message) || "usage 失败结算未完成"), { code: code || "USAGE_ACTION_FAILED" });
}

async function migrateLegacy(now) {
  const res = await db.collection(TASKS).where({ status: "submit_pending" }).limit(100).get();
  let migrated = 0;
  for (const task of res.data || []) {
    await db.collection(TASKS).doc(task._id || task.usageId).update({ data: {
      status: "queued",
      jobId: "",
      nextAttemptAt: now,
      leaseOwner: "",
      leaseExpiresAt: null,
      errorCode: null,
      errorMessage: null,
      updatedAt: now,
    } });
    migrated += 1;
  }
  return migrated;
}

async function releaseExpiredRuntime(now) {
  const runtime = await getDoc(RUNTIME, "worker");
  if (!runtime || !isExpired(runtime.leaseExpiresAt, now.getTime())) return 0;
  await db.collection(RUNTIME).doc("worker").update({ data: {
    leaseOwner: "",
    leaseExpiresAt: null,
    currentUsageId: "",
    requestId: "",
    updatedAt: now,
  } });
  return 1;
}

async function recoverExpiredTasks(now) {
  const res = await db.collection(TASKS).where({ status: _.in(["processing", "importing"]) }).limit(100).get();
  let recovered = 0;
  for (const task of res.data || []) {
    if (!isExpired(task.leaseExpiresAt, now.getTime())) continue;
    await db.collection(TASKS).doc(task._id || task.usageId).update({ data: {
      status: "queued",
      progress: Math.min(75, Math.max(5, Number(task.progress || 0))),
      nextAttemptAt: now,
      leaseOwner: "",
      leaseExpiresAt: null,
      errorCode: "LEASE_RECOVERED",
      errorMessage: "Worker 租约过期，任务已恢复排队",
      updatedAt: now,
    } });
    recovered += 1;
  }
  return recovered;
}

async function markTimedOut(task, now) {
  const updated = {
    ...task,
    status: "timed_out",
    errorCode: "TIMEOUT",
    errorMessage: "课程生成超过 45 分钟",
  };
  let usageSettled = false;
  try {
    await callFailUsage(updated);
    usageSettled = true;
  } catch (err) {
    console.error(JSON.stringify({ event: "usage_fail_deferred", usageId: task.usageId, errorCode: err.code || "USAGE_ACTION_FAILED" }));
  }
  await db.collection(TASKS).doc(task._id || task.usageId).update({ data: {
    status: "timed_out",
    progress: 100,
    errorCode: "TIMEOUT",
    errorMessage: "课程生成超过 45 分钟",
    leaseOwner: "",
    leaseExpiresAt: null,
    usageSettledAt: usageSettled ? now : null,
    updatedAt: now,
    finishedAt: now,
  } });
  const artifact = await getDoc(ARTIFACTS, task.usageId);
  if (artifact) await db.collection(ARTIFACTS).doc(task.usageId).remove();
}

async function timeoutTasks(now) {
  const res = await db.collection(TASKS).where({ status: _.in(ACTIVE_STATUSES) }).limit(100).get();
  let timedOut = 0;
  for (const task of res.data || []) {
    if (!isExpired(task.deadlineAt, now.getTime())) continue;
    await markTimedOut(task, now);
    timedOut += 1;
  }
  return timedOut;
}

async function settleTerminals() {
  const res = await db.collection(TASKS).where({ status: _.in(TERMINAL_STATUSES) }).limit(100).get();
  let settled = 0;
  let deferred = 0;
  for (const task of res.data || []) {
    if (task.usageSettledAt) continue;
    try {
      await callFailUsage(task);
      settled += 1;
      await db.collection(TASKS).doc(task._id || task.usageId).update({ data: { usageSettledAt: new Date(), updatedAt: new Date() } });
      const artifact = await getDoc(ARTIFACTS, task.usageId);
      if (artifact) await db.collection(ARTIFACTS).doc(task.usageId).remove();
    } catch (err) {
      deferred += 1;
      console.error(JSON.stringify({ event: "usage_fail_deferred", usageId: task.usageId, errorCode: err.code || "USAGE_ACTION_FAILED" }));
    }
  }
  return { settled, deferred };
}

exports.main = async (event, context) => {
  const requestId = context.requestId || `reconcile-${Date.now()}`;
  const authError = verifyCaller(event || {});
  if (authError) return makeResponse(false, authError, requestId);
  const now = new Date();
  try {
    const migrated = await migrateLegacy(now);
    const runtimeReleased = await releaseExpiredRuntime(now);
    const recovered = await recoverExpiredTasks(now);
    const timedOut = await timeoutTasks(now);
    const terminal = await settleTerminals();
    const data = { migrated, runtimeReleased, recovered, timedOut, settled: terminal.settled, deferred: terminal.deferred };
    console.log(JSON.stringify({ event: "reconcile_completed", requestId, ...data }));
    return makeResponse(true, data, requestId);
  } catch (err) {
    console.error(JSON.stringify({ event: "reconcile_failed", requestId, errorCode: err.code || "RECONCILE_FAILED" }));
    return makeResponse(false, { code: err.code || "RECONCILE_FAILED", message: err.message || "协调任务失败" }, requestId);
  }
};
