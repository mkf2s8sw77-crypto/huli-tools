const cloud = require("wx-server-sdk");
const { canAcquireLease } = require("./core/lease");
const { normalizeCourse, repairJson, PROTOCOL } = require("./core/contract");
const { generateFallbackCourse } = require("./core/fallback");
const { generateCourseText, smokeModel } = require("./model-client");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const TASKS = "app_maic_tasks";
const RUNTIME = "app_maic_runtime";
const ARTIFACTS = "app_maic_artifacts";
const COURSES = "app_maic_courses";
const SCENES = "app_maic_scenes";
const RUNTIME_ID = "worker";
const LEASE_MS = 330 * 1000;
const MAX_ATTEMPTS = 3;

function makeResponse(ok, dataOrError, requestId) {
  if (ok) return { ok: true, data: dataOrError || {}, requestId };
  return { ok: false, error: dataOrError || { code: "UNKNOWN", message: "未知错误" }, requestId };
}

function getInternalToken() {
  return process.env.INTERNAL_API_SECRET || "";
}

function verifyInternal(event) {
  const token = getInternalToken();
  if (!token) return { code: "INTERNAL_SECRET_NOT_CONFIGURED", message: "内部调用凭据未配置" };
  if (!event || event._internalToken !== token) return { code: "FORBIDDEN", message: "内部接口，禁止直接调用" };
  return null;
}

function isTimerEvent(event) {
  return Boolean(event && (event.Type === "Timer" || event.TriggerName || event.triggerName));
}

function isNotFound(err) {
  return Boolean(err && (err.errCode === -502003 || /not exist|not found/i.test(err.message || "")));
}

async function getDoc(collection, id, executor) {
  try {
    const target = executor || db;
    const res = await target.collection(collection).doc(id).get();
    return res.data || null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

function logEvent(event, details) {
  console.log(JSON.stringify({ event, ...(details || {}) }));
}

async function callUsageAction(action, task, extra) {
  const res = await cloud.callFunction({
    name: "coreApp",
    data: {
      action,
      _internalToken: getInternalToken(),
      userId: task.userId,
      usageId: task.usageId,
      ...(extra || {}),
    },
  });
  const result = res.result || {};
  if (result.ok) return result.data || {};
  const error = result.error || {};
  const idempotentCodes = action === "finishUsage"
    ? ["USAGE_ALREADY_FINISHED"]
    : ["USAGE_ALREADY_FAILED", "USAGE_ALREADY_FINISHED"];
  if (idempotentCodes.includes(error.code)) return { idempotent: true };
  throw Object.assign(new Error(error.message || `${action} 调用失败`), {
    code: error.code || "USAGE_ACTION_FAILED",
    transient: true,
  });
}

async function acquireLease(owner, requestId) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
  return db.runTransaction(async (transaction) => {
    const runtime = await getDoc(RUNTIME, RUNTIME_ID, transaction);
    if (!canAcquireLease(runtime, now.getTime())) return false;
    const data = {
      leaseOwner: owner,
      leaseExpiresAt,
      currentUsageId: "",
      requestId,
      updatedAt: now,
      createdAt: runtime && runtime.createdAt ? runtime.createdAt : now,
    };
    if (runtime) await transaction.collection(RUNTIME).doc(RUNTIME_ID).update({ data });
    else await transaction.collection(RUNTIME).doc(RUNTIME_ID).set({ data });
    return true;
  });
}

async function setLeaseUsage(owner, usageId) {
  const runtime = await getDoc(RUNTIME, RUNTIME_ID);
  if (!runtime || runtime.leaseOwner !== owner) return false;
  await db.collection(RUNTIME).doc(RUNTIME_ID).update({
    data: { currentUsageId: usageId, updatedAt: new Date() },
  });
  return true;
}

async function releaseLease(owner) {
  const runtime = await getDoc(RUNTIME, RUNTIME_ID);
  if (!runtime || runtime.leaseOwner !== owner) return false;
  await db.collection(RUNTIME).doc(RUNTIME_ID).update({
    data: { leaseOwner: "", leaseExpiresAt: null, currentUsageId: "", requestId: "", updatedAt: new Date() },
  });
  return true;
}

async function claimNextTask(owner) {
  const now = new Date();
  const res = await db.collection(TASKS)
    .where({ status: "queued", nextAttemptAt: _.lte(now) })
    .orderBy("nextAttemptAt", "asc")
    .limit(1)
    .get();
  const candidate = (res.data || [])[0];
  if (!candidate) return null;
  return db.runTransaction(async (transaction) => {
    const latest = await getDoc(TASKS, candidate._id || candidate.usageId, transaction);
    if (!latest || latest.status !== "queued") return null;
    const nextAttemptAt = latest.nextAttemptAt ? new Date(latest.nextAttemptAt).getTime() : 0;
    if (nextAttemptAt > now.getTime()) return null;
    const task = {
      ...latest,
      status: "processing",
      progress: Math.max(15, Number(latest.progress || 0)),
      attempts: Number(latest.attempts || 0) + 1,
      leaseOwner: owner,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      errorCode: null,
      errorMessage: null,
      updatedAt: now,
    };
    const taskId = latest._id || latest.usageId;
    const taskData = { ...task };
    delete taskData._id;
    await transaction.collection(TASKS).doc(taskId).update({ data: taskData });
    return { ...taskData, _id: taskId };
  });
}

function aggregateUsage(current, addition) {
  const left = current || {};
  const right = addition || {};
  return {
    promptTokens: Number(left.promptTokens || 0) + Number(right.promptTokens || 0),
    completionTokens: Number(left.completionTokens || 0) + Number(right.completionTokens || 0),
    totalTokens: Number(left.totalTokens || 0) + Number(right.totalTokens || 0),
  };
}

async function generateValidatedCourse(task) {
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let firstText = "";
  try {
    const first = await generateCourseText(task);
    firstText = first.text;
    usage = aggregateUsage(usage, first.usage);
    return { course: normalizeCourse(repairJson(first.text), task), usage, model: first.model, fallbackUsed: false, correctionUsed: false };
  } catch (err) {
    if (err.transient || err.code === "MODEL_CONFIG_MISSING" || err.code === "MODEL_CONFIG_INVALID" || err.code === "MODEL_REQUEST_FAILED") throw err;
    if (err.code !== "INVALID_PROTOCOL") throw err;
    try {
      const corrected = await generateCourseText(task, { previousText: firstText, errorMessage: err.message });
      usage = aggregateUsage(usage, corrected.usage);
      return { course: normalizeCourse(repairJson(corrected.text), task), usage, model: corrected.model, fallbackUsed: false, correctionUsed: true };
    } catch (correctionError) {
      if (correctionError.transient || correctionError.code === "MODEL_CONFIG_MISSING" || correctionError.code === "MODEL_CONFIG_INVALID" || correctionError.code === "MODEL_REQUEST_FAILED") throw correctionError;
      return {
        course: generateFallbackCourse(task),
        usage,
        // 兜底课程由模板生成而非模型产出，如实记录；实际模型名见 coreModel 绑定配置
        model: "template_fallback",
        fallbackUsed: true,
        correctionUsed: true,
      };
    }
  }
}

async function saveArtifact(task, generated) {
  const now = new Date();
  await db.collection(ARTIFACTS).doc(task.usageId).set({
    data: {
      userId: task.userId,
      usageId: task.usageId,
      protocol: PROTOCOL,
      course: generated.course,
      fallbackUsed: generated.fallbackUsed,
      correctionUsed: generated.correctionUsed,
      model: generated.model,
      tokenUsage: generated.usage,
      status: "validated",
      createdAt: now,
      updatedAt: now,
    },
  });
}

async function ensureTaskCanContinue(task) {
  const latest = await getDoc(TASKS, task.usageId);
  if (!latest) throw Object.assign(new Error("任务不存在"), { code: "TASK_NOT_FOUND" });
  if (latest.status === "cancelled") throw Object.assign(new Error("用户已取消任务"), { code: "CANCELLED" });
  const deadline = latest.deadlineAt ? new Date(latest.deadlineAt).getTime() : 0;
  if (deadline && deadline <= Date.now()) throw Object.assign(new Error("课程生成超过 45 分钟"), { code: "TIMEOUT" });
  return latest;
}

async function importCourse(task, course) {
  await ensureTaskCanContinue(task);
  const now = new Date();
  const courseId = task.usageId;
  await db.collection(TASKS).doc(task.usageId).update({ data: { status: "importing", progress: 82, updatedAt: now } });
  await db.collection(COURSES).doc(courseId).set({
    data: {
      userId: task.userId,
      usageId: task.usageId,
      externalCourseId: course.courseId,
      protocol: course.protocol,
      title: course.title,
      summary: course.summary,
      language: course.language,
      sceneCount: course.scenes.length,
      assetCount: 0,
      assetMap: {},
      status: "importing",
      createdAt: task.createdAt || now,
      sourceCreatedAt: course.createdAt,
      updatedAt: now,
    },
  });
  for (let index = 0; index < course.scenes.length; index += 1) {
    const scene = course.scenes[index];
    await db.collection(SCENES).doc(`${courseId}_${scene.id}`).set({
      data: {
        userId: task.userId,
        courseId,
        sceneId: scene.id,
        order: index,
        kind: scene.kind,
        title: scene.title,
        scene,
        createdAt: now,
        updatedAt: now,
      },
    });
  }
  await ensureTaskCanContinue(task);
  await callUsageAction("finishUsage", task, { resultRef: { courseId, protocol: PROTOCOL } });
  const finishedAt = new Date();
  await db.collection(COURSES).doc(courseId).update({ data: { status: "ready", updatedAt: finishedAt } });
  await db.collection(TASKS).doc(task.usageId).update({
    data: {
      status: "succeeded",
      progress: 100,
      courseId,
      jobId: "",
      leaseOwner: "",
      leaseExpiresAt: null,
      errorCode: null,
      errorMessage: null,
      updatedAt: finishedAt,
      finishedAt,
    },
  });
  await db.collection(ARTIFACTS).doc(task.usageId).remove();
  return courseId;
}

async function settleTerminal(task, status, code, message) {
  let usageSettled = false;
  try {
    await callUsageAction("failUsage", task, { errorCode: code, errorMessage: message });
    usageSettled = true;
  } catch (err) {
    logEvent("usage_fail_deferred", { usageId: task.usageId, status, errorCode: err.code || "USAGE_ACTION_FAILED" });
  }
  const now = new Date();
  await db.collection(TASKS).doc(task.usageId).update({
    data: {
      status,
      progress: 100,
      errorCode: code,
      errorMessage: String(message || "任务失败").slice(0, 1000),
      leaseOwner: "",
      leaseExpiresAt: null,
      usageSettledAt: usageSettled ? now : null,
      updatedAt: now,
      finishedAt: now,
    },
  });
  const course = await getDoc(COURSES, task.usageId);
  if (course && course.status !== "ready") await db.collection(COURSES).doc(task.usageId).update({ data: { status: "failed", updatedAt: now } });
  const artifact = await getDoc(ARTIFACTS, task.usageId);
  if (artifact) await db.collection(ARTIFACTS).doc(task.usageId).remove();
}

async function requeueOrFail(task, err) {
  if (err.code === "CANCELLED") {
    await settleTerminal(task, "cancelled", "CANCELLED", "用户取消课程生成");
    return "cancelled";
  }
  if (err.code === "TIMEOUT") {
    await settleTerminal(task, "timed_out", "TIMEOUT", "课程生成超过 45 分钟");
    return "timed_out";
  }
  const attempts = Number(task.attempts || 1);
  if (err.transient && attempts < MAX_ATTEMPTS) {
    const delayMs = [60000, 120000, 300000][Math.max(0, attempts - 1)];
    await db.collection(TASKS).doc(task.usageId).update({
      data: {
        status: "queued",
        progress: Math.min(70, Math.max(5, Number(task.progress || 0))),
        nextAttemptAt: new Date(Date.now() + delayMs),
        leaseOwner: "",
        leaseExpiresAt: null,
        errorCode: err.code || "MODEL_TRANSIENT_ERROR",
        errorMessage: String(err.message || "模型服务暂时不可用").slice(0, 1000),
        updatedAt: new Date(),
      },
    });
    return "queued";
  }
  await settleTerminal(task, "failed", err.code || "GENERATION_FAILED", err.message || "课程生成失败");
  return "failed";
}

async function processTask(task, requestId) {
  const artifact = await getDoc(ARTIFACTS, task.usageId);
  let generated;
  if (artifact && artifact.course) {
    generated = {
      course: normalizeCourse(artifact.course, task),
      usage: artifact.tokenUsage || {},
      model: artifact.model || "",
      fallbackUsed: Boolean(artifact.fallbackUsed),
      correctionUsed: Boolean(artifact.correctionUsed),
    };
  } else {
    generated = await generateValidatedCourse(task);
    await ensureTaskCanContinue(task);
    await saveArtifact(task, generated);
  }
  await db.collection(TASKS).doc(task.usageId).update({ data: {
    model: generated.model,
    fallbackUsed: generated.fallbackUsed,
    correctionUsed: generated.correctionUsed,
    tokenUsage: generated.usage,
    updatedAt: new Date(),
  } });
  await importCourse(task, generated.course);
  logEvent("task_succeeded", {
    requestId,
    usageId: task.usageId,
    status: "succeeded",
    retryCount: Math.max(0, Number(task.attempts || 1) - 1),
    tokenUsage: generated.usage,
    fallbackUsed: generated.fallbackUsed,
  });
  return { status: "succeeded", usageId: task.usageId, courseId: task.usageId };
}

async function runOnce(event, context) {
  const requestId = context.requestId || `worker-${Date.now()}`;
  if (!isTimerEvent(event)) {
    const authError = verifyInternal(event);
    if (authError) return makeResponse(false, authError, requestId);
  }
  const owner = `${requestId}-${Math.random().toString(36).slice(2, 10)}`;
  const acquired = await acquireLease(owner, requestId);
  if (!acquired) return makeResponse(true, { acquired: false, processed: 0 }, requestId);
  let task = null;
  try {
    task = await claimNextTask(owner);
    if (!task) return makeResponse(true, { acquired: true, processed: 0 }, requestId);
    await setLeaseUsage(owner, task.usageId);
    const result = await processTask(task, requestId);
    return makeResponse(true, { acquired: true, processed: 1, result }, requestId);
  } catch (err) {
    const status = task ? await requeueOrFail(task, err) : "error";
    logEvent("task_error", {
      requestId,
      usageId: task && task.usageId,
      status,
      retryCount: task ? Math.max(0, Number(task.attempts || 1) - 1) : 0,
      errorCode: err.code || "WORKER_FAILED",
    });
    return makeResponse(task ? true : false, task
      ? { acquired: true, processed: 1, result: { usageId: task.usageId, status } }
      : { code: err.code || "WORKER_FAILED", message: err.message || "Worker 执行失败" }, requestId);
  } finally {
    await releaseLease(owner);
  }
}

async function modelSmoke(event, context) {
  const requestId = context.requestId || `smoke-${Date.now()}`;
  const authError = verifyInternal(event);
  if (authError) return makeResponse(false, authError, requestId);
  try {
    const result = await smokeModel();
    let parsed = null;
    try { parsed = repairJson(result.text); } catch (_err) { parsed = null; }
    const responseReceived = Boolean(result.text && String(result.text).trim());
    logEvent("model_smoke", { requestId, status: responseReceived ? "succeeded" : "invalid", tokenUsage: result.usage, model: result.model, jsonContract: Boolean(parsed && parsed.ok) });
    if (!responseReceived) return makeResponse(false, { code: "MODEL_SMOKE_INVALID", message: "模型未返回内容" }, requestId);
    return makeResponse(true, { model: result.model, tokenUsage: result.usage, jsonContract: Boolean(parsed && parsed.ok) }, requestId);
  } catch (err) {
    logEvent("model_smoke", { requestId, status: "failed", errorCode: err.code || "MODEL_SMOKE_FAILED" });
    return makeResponse(false, { code: err.code || "MODEL_SMOKE_FAILED", message: err.message || "模型连通性测试失败" }, requestId);
  }
}

exports.main = async (event, context) => {
  if (event && event.action === "modelSmoke") return modelSmoke(event, context || {});
  return runOnce(event || {}, context || {});
};
