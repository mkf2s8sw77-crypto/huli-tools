const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const APP_KEY = "maic";
const TASKS = "app_maic_tasks";
const COURSES = "app_maic_courses";
const SCENES = "app_maic_scenes";
const PROGRESS = "app_maic_progress";
const ASSETS = "app_maic_assets";
const ARTIFACTS = "app_maic_artifacts";
const TERMINAL_STATUSES = ["succeeded", "failed", "cancelled", "timed_out"];
const MAX_JOB_MS = 45 * 60 * 1000;
const MAX_TOPIC_LENGTH = 500;
const MAX_REQUIREMENTS_LENGTH = 3000;
const FORBIDDEN_PAYLOAD = /<\/?[a-z][^>]*>|javascript\s*:|data\s*:\s*text\/html|\b(?:iframe|webview|script)\b/i;

function makeResponse(ok, dataOrError, requestId) {
  if (ok) return { ok: true, data: dataOrError || {}, requestId };
  return { ok: false, error: dataOrError || { code: "UNKNOWN", message: "未知错误" }, requestId };
}

function getString(value) {
  return typeof value === "string" ? value.trim() : "";
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

function resolveActor(event) {
  const wxContext = cloud.getWXContext();
  if (event._internalToken || event.userId) {
    const error = verifyInternal(event);
    if (error) return { ok: false, error };
    const userId = event.userId || wxContext.OPENID;
    if (!userId) return { ok: false, error: { code: "UNAUTHORIZED", message: "无法获取用户身份" } };
    return { ok: true, userId, internal: true };
  }
  if (!wxContext.OPENID) return { ok: false, error: { code: "UNAUTHORIZED", message: "无法获取用户身份" } };
  return { ok: true, userId: wxContext.OPENID, internal: false };
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

function validatePlainPayload(value, path) {
  const currentPath = path || "$";
  if (typeof value === "string" && FORBIDDEN_PAYLOAD.test(value)) {
    throw Object.assign(new Error(`协议字段包含禁止内容: ${currentPath}`), { code: "INVALID_PROTOCOL" });
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validatePlainPayload(item, `${currentPath}[${index}]`));
    return;
  }
  if (value && typeof value === "object") Object.keys(value).forEach((key) => validatePlainPayload(value[key], `${currentPath}.${key}`));
}

async function validateUsage(usageId, userId) {
  const usage = await getDoc("app_usage_records", usageId);
  if (!usage) throw Object.assign(new Error("使用记录不存在"), { code: "USAGE_NOT_FOUND" });
  if (usage.userId !== userId) throw Object.assign(new Error("无权操作该使用记录"), { code: "FORBIDDEN" });
  if (usage.appKey !== APP_KEY) throw Object.assign(new Error("使用记录不属于 MAIC"), { code: "APP_MISMATCH" });
  if (!["created", "frozen"].includes(usage.status)) throw Object.assign(new Error("使用记录状态不可生成"), { code: "INVALID_USAGE_STATUS" });
  return usage;
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
  throw Object.assign(new Error(error.message || `${action} 调用失败`), { code: error.code || "USAGE_ACTION_FAILED" });
}

function publicTask(task) {
  return {
    usageId: task.usageId,
    jobId: "",
    status: task.status,
    progress: task.progress || 0,
    error: task.errorCode ? { code: task.errorCode, message: task.errorMessage || "生成失败" } : null,
    courseId: task.courseId || "",
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    finishedAt: task.finishedAt || null,
  };
}

function getDailyLimit() {
  const configured = Number(process.env.MAIC_DAILY_LIMIT || 3);
  if (!Number.isInteger(configured)) return 3;
  return Math.min(3, Math.max(1, configured));
}

function getShanghaiDayStart(now) {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 8 * 60 * 60 * 1000);
}

async function getTodayTaskCount(userId, now) {
  const res = await db.collection(TASKS).where({ userId, createdAt: _.gte(getShanghaiDayStart(now)) }).count();
  return Number(res.total || 0);
}

async function failUsageQuietly(task, code, message) {
  try {
    await callUsageAction("failUsage", task, { errorCode: code, errorMessage: message });
    return true;
  } catch (err) {
    console.error(JSON.stringify({ event: "usage_fail_deferred", usageId: task.usageId, errorCode: err.code || "USAGE_ACTION_FAILED" }));
    return false;
  }
}

async function createTask(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const actor = resolveActor(event);
  if (!actor.ok) return makeResponse(false, actor.error, requestId);
  const usageId = getString(event.usageId);
  const topic = getString(event.topic);
  const audience = getString(event.audience).slice(0, 200);
  const requirements = getString(event.requirements);
  const durationMinutes = Number(event.durationMinutes || 10);
  if (!usageId || topic.length < 2 || topic.length > MAX_TOPIC_LENGTH) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "课程主题需为 2 至 500 个字符" }, requestId);
  }
  if (requirements.length > MAX_REQUIREMENTS_LENGTH || !Number.isInteger(durationMinutes) || durationMinutes < 3 || durationMinutes > 45) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "课程时长或补充要求无效" }, requestId);
  }
  if (FORBIDDEN_PAYLOAD.test(topic) || FORBIDDEN_PAYLOAD.test(audience) || FORBIDDEN_PAYLOAD.test(requirements)) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "输入中不能包含 HTML、脚本或 WebView 内容" }, requestId);
  }
  let usageValidated = false;
  let taskStored = false;
  try {
    const existing = await getDoc(TASKS, usageId);
    if (existing) {
      if (existing.userId !== actor.userId) return makeResponse(false, { code: "FORBIDDEN", message: "无权访问该任务" }, requestId);
      return makeResponse(true, { task: publicTask(existing), idempotent: true }, requestId);
    }
    await validateUsage(usageId, actor.userId);
    usageValidated = true;
    const now = new Date();
    const dailyLimit = getDailyLimit();
    const usedToday = await getTodayTaskCount(actor.userId, now);
    if (usedToday >= dailyLimit) {
      await failUsageQuietly({ userId: actor.userId, usageId }, "DAILY_LIMIT_REACHED", `每天最多生成 ${dailyLimit} 门课程`);
      return makeResponse(false, { code: "DAILY_LIMIT_REACHED", message: `每天最多生成 ${dailyLimit} 门课程，请明天再试` }, requestId);
    }
    const task = {
      userId: actor.userId,
      appKey: APP_KEY,
      usageId,
      jobId: "",
      courseId: "",
      topic,
      audience,
      durationMinutes,
      requirements,
      status: "queued",
      progress: 5,
      attempts: 0,
      importAttempts: 0,
      errorCode: null,
      errorMessage: null,
      nextAttemptAt: now,
      deadlineAt: new Date(now.getTime() + MAX_JOB_MS),
      leaseOwner: "",
      leaseExpiresAt: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    };
    await db.collection(TASKS).doc(usageId).set({ data: task });
    taskStored = true;
    return makeResponse(true, { task: publicTask(task), idempotent: false }, requestId);
  } catch (err) {
    if (usageValidated && !taskStored) await failUsageQuietly({ userId: actor.userId, usageId }, err.code || "CREATE_TASK_FAILED", err.message || "创建任务失败");
    return makeResponse(false, { code: err.code || "CREATE_TASK_FAILED", message: err.message || "创建任务失败" }, requestId);
  }
}

async function getTask(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const actor = resolveActor(event);
  if (!actor.ok) return makeResponse(false, actor.error, requestId);
  try {
    const task = await getDoc(TASKS, getString(event.usageId));
    if (!task) return makeResponse(false, { code: "TASK_NOT_FOUND", message: "任务不存在" }, requestId);
    if (task.userId !== actor.userId) return makeResponse(false, { code: "FORBIDDEN", message: "无权访问该任务" }, requestId);
    return makeResponse(true, { task: publicTask(task) }, requestId);
  } catch (err) {
    return makeResponse(false, { code: err.code || "QUERY_TASK_FAILED", message: err.message || "查询任务失败" }, requestId);
  }
}

async function cancelTask(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const actor = resolveActor(event);
  if (!actor.ok) return makeResponse(false, actor.error, requestId);
  try {
    const task = await getDoc(TASKS, getString(event.usageId));
    if (!task) return makeResponse(false, { code: "TASK_NOT_FOUND", message: "任务不存在" }, requestId);
    if (task.userId !== actor.userId) return makeResponse(false, { code: "FORBIDDEN", message: "无权操作该任务" }, requestId);
    if (!TERMINAL_STATUSES.includes(task.status)) {
      const usageSettled = await failUsageQuietly(task, "CANCELLED", "用户取消课程生成");
      const now = new Date();
      await db.collection(TASKS).doc(task.usageId).update({ data: {
        status: "cancelled",
        progress: 100,
        errorCode: "CANCELLED",
        errorMessage: "用户取消课程生成",
        leaseOwner: "",
        leaseExpiresAt: null,
        usageSettledAt: usageSettled ? now : null,
        updatedAt: now,
        finishedAt: now,
      } });
      const artifact = await getDoc(ARTIFACTS, task.usageId);
      if (artifact) await db.collection(ARTIFACTS).doc(task.usageId).remove();
    }
    return makeResponse(true, { task: publicTask(await getDoc(TASKS, task.usageId)) }, requestId);
  } catch (err) {
    return makeResponse(false, { code: err.code || "CANCEL_FAILED", message: err.message || "取消任务失败" }, requestId);
  }
}

async function listCourses(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const actor = resolveActor(event);
  if (!actor.ok) return makeResponse(false, actor.error, requestId);
  const page = Math.max(1, Number(event.page || 1));
  const pageSize = Math.min(20, Math.max(1, Number(event.pageSize || 10)));
  try {
    const query = db.collection(COURSES).where({ userId: actor.userId, status: "ready" });
    const [listRes, countRes] = await Promise.all([
      query.orderBy("updatedAt", "desc").skip((page - 1) * pageSize).limit(pageSize).get(),
      query.count(),
    ]);
    const list = (listRes.data || []).map((item) => ({
      courseId: item._id,
      title: item.title,
      summary: item.summary,
      protocol: item.protocol,
      sceneCount: item.sceneCount,
      updatedAt: item.updatedAt,
      createdAt: item.createdAt,
    }));
    return makeResponse(true, { list, total: countRes.total || 0, page, pageSize }, requestId);
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询课程失败: " + err.message }, requestId);
  }
}

async function getCourse(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const actor = resolveActor(event);
  if (!actor.ok) return makeResponse(false, actor.error, requestId);
  try {
    const course = await getDoc(COURSES, getString(event.courseId));
    if (!course || course.status !== "ready") return makeResponse(false, { code: "COURSE_NOT_FOUND", message: "课程不存在" }, requestId);
    if (course.userId !== actor.userId) return makeResponse(false, { code: "FORBIDDEN", message: "无权访问该课程" }, requestId);
    return makeResponse(true, { course: { ...course, courseId: course._id, _id: undefined, userId: undefined } }, requestId);
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询课程失败: " + err.message }, requestId);
  }
}

async function listScenes(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const actor = resolveActor(event);
  if (!actor.ok) return makeResponse(false, actor.error, requestId);
  const courseId = getString(event.courseId);
  try {
    const course = await getDoc(COURSES, courseId);
    if (!course || course.userId !== actor.userId || course.status !== "ready") {
      return makeResponse(false, { code: course ? "FORBIDDEN" : "COURSE_NOT_FOUND", message: "无权访问该课程" }, requestId);
    }
    const [sceneRes, assetRes] = await Promise.all([
      db.collection(SCENES).where({ userId: actor.userId, courseId }).orderBy("order", "asc").limit(100).get(),
      db.collection(ASSETS).where({ userId: actor.userId, courseId }).limit(100).get(),
    ]);
    const fileList = (assetRes.data || []).map((asset) => asset.fileID).filter(Boolean);
    const assetUrls = {};
    if (fileList.length) {
      const tempRes = await cloud.getTempFileURL({ fileList });
      (tempRes.fileList || []).forEach((item) => {
        const asset = (assetRes.data || []).find((candidate) => candidate.fileID === item.fileID);
        if (asset && item.status === 0) assetUrls[asset.assetId] = item.tempFileURL;
      });
    }
    return makeResponse(true, { protocol: course.protocol, scenes: (sceneRes.data || []).map((item) => item.scene), assetUrls }, requestId);
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询场景失败: " + err.message }, requestId);
  }
}

async function getProgress(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const actor = resolveActor(event);
  if (!actor.ok) return makeResponse(false, actor.error, requestId);
  const courseId = getString(event.courseId);
  try {
    const course = await getDoc(COURSES, courseId);
    if (!course || course.userId !== actor.userId) return makeResponse(false, { code: "FORBIDDEN", message: "无权访问该课程" }, requestId);
    const progress = await getDoc(PROGRESS, `${actor.userId}_${courseId}`);
    return makeResponse(true, { progress: progress ? progress.data || {} : {} }, requestId);
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询学习进度失败: " + err.message }, requestId);
  }
}

async function saveProgress(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const actor = resolveActor(event);
  if (!actor.ok) return makeResponse(false, actor.error, requestId);
  const courseId = getString(event.courseId);
  const data = event.progress && typeof event.progress === "object" ? event.progress : {};
  if (JSON.stringify(data).length > 30000) return makeResponse(false, { code: "INVALID_PARAM", message: "学习进度数据过大" }, requestId);
  try {
    const course = await getDoc(COURSES, courseId);
    if (!course || course.userId !== actor.userId) return makeResponse(false, { code: "FORBIDDEN", message: "无权访问该课程" }, requestId);
    validatePlainPayload(data);
    const now = new Date();
    const existing = await getDoc(PROGRESS, `${actor.userId}_${courseId}`);
    await db.collection(PROGRESS).doc(`${actor.userId}_${courseId}`).set({
      data: { userId: actor.userId, courseId, data, updatedAt: now, createdAt: existing && existing.createdAt ? existing.createdAt : now },
    });
    return makeResponse(true, { courseId, updatedAt: now }, requestId);
  } catch (err) {
    return makeResponse(false, { code: err.code || "DB_ERROR", message: "保存学习进度失败: " + err.message }, requestId);
  }
}

async function deleteCourse(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const actor = resolveActor(event);
  if (!actor.ok) return makeResponse(false, actor.error, requestId);
  const courseId = getString(event.courseId);
  try {
    const course = await getDoc(COURSES, courseId);
    if (!course) return makeResponse(true, { courseId, deleted: false }, requestId);
    if (course.userId !== actor.userId) return makeResponse(false, { code: "FORBIDDEN", message: "无权删除该课程" }, requestId);
    const assetRes = await db.collection(ASSETS).where({ userId: actor.userId, courseId }).limit(100).get();
    const fileList = (assetRes.data || []).map((item) => item.fileID).filter(Boolean);
    if (fileList.length) await cloud.deleteFile({ fileList });
    await Promise.all([
      db.collection(SCENES).where({ userId: actor.userId, courseId }).remove(),
      db.collection(ASSETS).where({ userId: actor.userId, courseId }).remove(),
      db.collection(PROGRESS).where({ userId: actor.userId, courseId }).remove(),
      db.collection(COURSES).doc(courseId).remove(),
    ]);
    return makeResponse(true, { courseId, deleted: true }, requestId);
  } catch (err) {
    return makeResponse(false, { code: "DELETE_FAILED", message: "删除课程失败: " + err.message }, requestId);
  }
}

exports.main = async (event, context) => {
  const action = event.action;
  if (action === "createTask") return createTask(event, context);
  if (action === "getTask") return getTask(event, context);
  if (action === "cancelTask") return cancelTask(event, context);
  if (action === "listCourses") return listCourses(event, context);
  if (action === "getCourse") return getCourse(event, context);
  if (action === "listScenes") return listScenes(event, context);
  if (action === "getProgress") return getProgress(event, context);
  if (action === "saveProgress") return saveProgress(event, context);
  if (action === "deleteCourse") return deleteCourse(event, context);
  return makeResponse(false, { code: "UNKNOWN_ACTION", message: "未知 action: " + action }, context.requestId || Date.now().toString());
};
