const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const https = require("https");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const APP_KEY = "maic";
const PROTOCOL = "maic-miniapp/1";
const TASKS = "app_maic_tasks";
const COURSES = "app_maic_courses";
const SCENES = "app_maic_scenes";
const PROGRESS = "app_maic_progress";
const ASSETS = "app_maic_assets";
const ACTIVE_STATUSES = ["submit_pending", "queued", "processing", "importing"];
const MAX_JOB_MS = 45 * 60 * 1000;
const MAX_TOPIC_LENGTH = 500;
const MAX_REQUIREMENTS_LENGTH = 3000;
const RECONCILE_DELAY_MS = 8000;
const FORBIDDEN_PAYLOAD = /<\/?[a-z][^>]*>|javascript\s*:|data\s*:\s*text\/html|\b(?:iframe|webview)\b/i;

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
  if (event._internalToken !== token) return { code: "FORBIDDEN", message: "内部接口，禁止直接调用" };
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
  if (!wxContext.OPENID) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "无法获取用户身份" } };
  }
  return { ok: true, userId: wxContext.OPENID, internal: false };
}

async function getDoc(collection, id) {
  try {
    const res = await db.collection(collection).doc(id).get();
    return res.data || null;
  } catch (err) {
    if (err.errCode === -502003 || /not exist|not found/i.test(err.message || "")) return null;
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
  if (value && typeof value === "object") {
    Object.keys(value).forEach((key) => validatePlainPayload(value[key], `${currentPath}.${key}`));
  }
}

function validateCourse(course) {
  if (!course || course.protocol !== PROTOCOL) {
    throw Object.assign(new Error("课程协议版本不兼容"), { code: "INVALID_PROTOCOL" });
  }
  if (!Array.isArray(course.scenes) || course.scenes.length === 0 || course.scenes.length > 40) {
    throw Object.assign(new Error("课程场景数量无效"), { code: "INVALID_PROTOCOL" });
  }
  const kinds = ["slide", "quiz", "interaction", "pbl"];
  const actions = ["speech", "highlight", "spotlight", "laser", "pause", "navigate"];
  const ids = new Set();
  course.scenes.forEach((scene) => {
    if (!scene || !scene.id || ids.has(scene.id) || !kinds.includes(scene.kind)) {
      throw Object.assign(new Error("课程包含无效或重复的场景"), { code: "INVALID_PROTOCOL" });
    }
    ids.add(scene.id);
    (scene.actions || []).forEach((action) => {
      if (!action || !actions.includes(action.type)) {
        throw Object.assign(new Error("课程包含不支持的动作"), { code: "INVALID_PROTOCOL" });
      }
    });
  });
  validatePlainPayload(course);
}

function getMaicConfig() {
  const baseUrl = getString(process.env.MAIC_API_BASE_URL).replace(/\/+$/, "");
  const secret = getString(process.env.MAIC_INTEGRATION_SECRET);
  if (!baseUrl || !secret || secret.length < 32) {
    throw Object.assign(new Error("MAIC 集成地址或密钥未配置"), { code: "MAIC_CONFIG_MISSING" });
  }
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:") {
    throw Object.assign(new Error("MAIC 集成地址必须使用 HTTPS"), { code: "MAIC_CONFIG_INVALID" });
  }
  return { baseUrl, secret };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildMaicHeaders(method, signedPath, body, secret) {
  const timestamp = String(Date.now());
  const nonce = crypto.randomBytes(18).toString("base64url");
  const bodyHash = sha256(body);
  const canonical = [method.toUpperCase(), signedPath, timestamp, nonce, bodyHash].join("\n");
  const signature = crypto.createHmac("sha256", secret).update(canonical).digest("hex");
  return {
    "Content-Type": "application/json",
    "x-huli-app": "huli-tools",
    "x-huli-timestamp": timestamp,
    "x-huli-nonce": nonce,
    "x-huli-path": signedPath,
    "x-huli-body-sha256": bodyHash,
    "x-huli-signature": signature,
  };
}

function httpsBufferRequest(url, method, headers, body, maxBytes) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method,
      headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
      timeout: 20000,
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy(new Error("MAIC 响应过大"));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ statusCode: res.statusCode || 500, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("MAIC 请求超时")));
    if (body) req.write(body);
    req.end();
  });
}

async function maicRequest(method, signedPath, payload) {
  const { baseUrl, secret } = getMaicConfig();
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const response = await httpsBufferRequest(
    baseUrl + signedPath,
    method,
    buildMaicHeaders(method, signedPath, body, secret),
    body,
    10 * 1024 * 1024
  );
  let parsed;
  try {
    parsed = JSON.parse(response.body.toString("utf8"));
  } catch (err) {
    throw Object.assign(new Error("MAIC 返回了无效 JSON"), { code: "MAIC_INVALID_RESPONSE" });
  }
  if (response.statusCode < 200 || response.statusCode >= 300 || !parsed.ok) {
    const error = parsed && parsed.error ? parsed.error : {};
    throw Object.assign(new Error(error.message || `MAIC 请求失败 (${response.statusCode})`), {
      code: error.code || "MAIC_REQUEST_FAILED",
      statusCode: response.statusCode,
    });
  }
  return parsed.data || {};
}

async function downloadMaicAsset(downloadPath, expectedChecksum) {
  const { baseUrl, secret } = getMaicConfig();
  const body = "";
  const response = await httpsBufferRequest(
    baseUrl + downloadPath,
    "GET",
    buildMaicHeaders("GET", downloadPath, body, secret),
    body,
    20 * 1024 * 1024
  );
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw Object.assign(new Error("MAIC 媒体下载失败"), { code: "ASSET_DOWNLOAD_FAILED" });
  }
  if (sha256(response.body) !== expectedChecksum) {
    throw Object.assign(new Error("媒体校验和不一致"), { code: "ASSET_CHECKSUM_MISMATCH" });
  }
  return response.body;
}

async function validateUsage(usageId, userId) {
  const usage = await getDoc("app_usage_records", usageId);
  if (!usage) throw Object.assign(new Error("使用记录不存在"), { code: "USAGE_NOT_FOUND" });
  if (usage.userId !== userId) throw Object.assign(new Error("无权操作该使用记录"), { code: "FORBIDDEN" });
  if (usage.appKey !== APP_KEY) throw Object.assign(new Error("使用记录不属于 MAIC"), { code: "APP_MISMATCH" });
  if (!["created", "frozen"].includes(usage.status)) {
    throw Object.assign(new Error("使用记录状态不可生成"), { code: "INVALID_USAGE_STATUS" });
  }
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
    : ["USAGE_ALREADY_FAILED"];
  if (idempotentCodes.includes(error.code)) return { idempotent: true };
  throw Object.assign(new Error(error.message || `${action} 调用失败`), { code: error.code || "USAGE_ACTION_FAILED" });
}

function publicTask(task) {
  return {
    usageId: task.usageId,
    jobId: task.jobId || "",
    status: task.status,
    progress: task.progress || 0,
    error: task.errorCode ? { code: task.errorCode, message: task.errorMessage || "生成失败" } : null,
    courseId: task.courseId || "",
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    finishedAt: task.finishedAt || null,
  };
}

async function markTaskFailed(task, code, message, status) {
  await callUsageAction("failUsage", task, { errorCode: code, errorMessage: message });
  const now = new Date();
  await db.collection(TASKS).doc(task.usageId).update({
    data: {
      status: status || "failed",
      progress: 100,
      errorCode: code,
      errorMessage: String(message || "任务失败").slice(0, 1000),
      updatedAt: now,
      finishedAt: now,
    },
  });
}

async function submitTask(task) {
  const data = await maicRequest("POST", "/api/integrations/huli-tools/v1/jobs", {
    usageId: task.usageId,
    topic: task.topic,
    audience: task.audience || undefined,
    durationMinutes: task.durationMinutes,
    requirements: task.requirements || undefined,
  });
  const now = new Date();
  await db.collection(TASKS).doc(task.usageId).update({
    data: {
      jobId: data.jobId,
      status: data.status || "queued",
      progress: data.progress || 5,
      upstreamStatus: data.status || "queued",
      reconcileAfter: new Date(now.getTime() + RECONCILE_DELAY_MS),
      errorCode: null,
      errorMessage: null,
      updatedAt: now,
    },
  });
  return getDoc(TASKS, task.usageId);
}

function assetExtension(mimeType) {
  const map = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "audio/mpeg": "mp3", "audio/mp4": "m4a", "video/mp4": "mp4" };
  return map[mimeType] || "bin";
}

async function importCourse(task, course) {
  validateCourse(course);
  const now = new Date();
  const courseId = task.usageId;
  await db.collection(TASKS).doc(task.usageId).update({ data: { status: "importing", progress: 80, updatedAt: now } });
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
      assetCount: (course.assets || []).length,
      status: "importing",
      createdAt: task.createdAt || now,
      sourceCreatedAt: course.createdAt,
      updatedAt: now,
    },
  });

  const assetMap = {};
  for (let i = 0; i < (course.assets || []).length; i += 1) {
    const asset = course.assets[i];
    if (!asset.downloadPath || asset.downloadPath.indexOf(`/jobs/${task.jobId}/`) === -1) {
      throw Object.assign(new Error("媒体下载描述无效"), { code: "INVALID_ASSET_DESCRIPTOR" });
    }
    const fileContent = await downloadMaicAsset(asset.downloadPath, asset.checksumSha256);
    const cloudPath = `app_maic/${task.userId}/${courseId}/${asset.id}.${assetExtension(asset.mimeType)}`;
    const uploaded = await cloud.uploadFile({ cloudPath, fileContent });
    assetMap[asset.id] = uploaded.fileID;
    await db.collection(ASSETS).doc(`${courseId}_${asset.id}`).set({
      data: {
        userId: task.userId,
        courseId,
        assetId: asset.id,
        type: asset.type,
        mimeType: asset.mimeType,
        checksumSha256: asset.checksumSha256,
        size: fileContent.length,
        cloudPath,
        fileID: uploaded.fileID,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  for (let i = 0; i < course.scenes.length; i += 1) {
    const scene = course.scenes[i];
    await db.collection(SCENES).doc(`${courseId}_${scene.id}`).set({
      data: {
        userId: task.userId,
        courseId,
        sceneId: scene.id,
        order: i,
        kind: scene.kind,
        title: scene.title,
        scene,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  await db.collection(COURSES).doc(courseId).update({
    data: { status: "ready", assetMap, updatedAt: new Date() },
  });
  await callUsageAction("finishUsage", task, { resultRef: { courseId, protocol: PROTOCOL } });
  await db.collection(TASKS).doc(task.usageId).update({
    data: {
      status: "succeeded",
      progress: 100,
      courseId,
      errorCode: null,
      errorMessage: null,
      updatedAt: new Date(),
      finishedAt: new Date(),
    },
  });
  return courseId;
}

async function reconcileOne(task) {
  const latest = await getDoc(TASKS, task.usageId);
  if (!latest || !ACTIVE_STATUSES.includes(latest.status)) return latest;
  const now = new Date();
  const deadline = latest.deadlineAt ? new Date(latest.deadlineAt).getTime() : 0;
  if (deadline && deadline <= now.getTime()) {
    if (latest.jobId) {
      try {
        await maicRequest("POST", `/api/integrations/huli-tools/v1/jobs/${latest.jobId}/cancel`, {});
      } catch (err) {
        console.error("cancel timed out MAIC job failed:", err);
      }
    }
    await markTaskFailed(latest, "TIMEOUT", "课程生成超过 45 分钟", "timed_out");
    return getDoc(TASKS, latest.usageId);
  }

  if (!latest.jobId) {
    try {
      return await submitTask(latest);
    } catch (err) {
      await db.collection(TASKS).doc(latest.usageId).update({
        data: {
          status: "submit_pending",
          errorCode: err.code || "MAIC_SUBMIT_FAILED",
          errorMessage: String(err.message || err).slice(0, 1000),
          reconcileAfter: new Date(now.getTime() + 30000),
          updatedAt: now,
        },
      });
      return getDoc(TASKS, latest.usageId);
    }
  }

  let upstream;
  try {
    upstream = await maicRequest("GET", `/api/integrations/huli-tools/v1/jobs/${latest.jobId}`);
  } catch (err) {
    if (err.code === "JOB_NOT_FOUND") {
      await db.collection(TASKS).doc(latest.usageId).update({
        data: {
          jobId: "",
          status: "submit_pending",
          upstreamStatus: "",
          errorCode: "JOB_NOT_FOUND",
          errorMessage: "MAIC 任务已丢失，正在按 usageId 幂等重提",
          reconcileAfter: now,
          updatedAt: now,
        },
      });
      return submitTask(await getDoc(TASKS, latest.usageId));
    }
    await db.collection(TASKS).doc(latest.usageId).update({
      data: {
        errorCode: err.code || "MAIC_QUERY_FAILED",
        errorMessage: String(err.message || err).slice(0, 1000),
        reconcileAfter: new Date(now.getTime() + 30000),
        updatedAt: now,
      },
    });
    return getDoc(TASKS, latest.usageId);
  }

  if (upstream.status === "queued" || upstream.status === "processing") {
    await db.collection(TASKS).doc(latest.usageId).update({
      data: {
        status: upstream.status,
        upstreamStatus: upstream.status,
        progress: upstream.progress || (upstream.status === "processing" ? 45 : 5),
        errorCode: null,
        errorMessage: null,
        reconcileAfter: new Date(now.getTime() + RECONCILE_DELAY_MS),
        updatedAt: now,
      },
    });
    return getDoc(TASKS, latest.usageId);
  }

  if (upstream.status === "succeeded") {
    try {
      const artifact = await maicRequest("GET", `/api/integrations/huli-tools/v1/jobs/${latest.jobId}/artifact`);
      const course = artifact.course;
      await importCourse(latest, course);
      return getDoc(TASKS, latest.usageId);
    } catch (err) {
      const retryCount = (latest.importAttempts || 0) + 1;
      if (retryCount >= 3) {
        await markTaskFailed(latest, err.code || "IMPORT_FAILED", err.message || "课程导入失败");
      } else {
        await db.collection(TASKS).doc(latest.usageId).update({
          data: {
            status: "importing",
            importAttempts: retryCount,
            errorCode: err.code || "IMPORT_FAILED",
            errorMessage: String(err.message || err).slice(0, 1000),
            reconcileAfter: new Date(now.getTime() + 30000),
            updatedAt: now,
          },
        });
      }
      return getDoc(TASKS, latest.usageId);
    }
  }

  if (upstream.status === "failed" || upstream.status === "cancelled") {
    const error = upstream.error || {};
    await markTaskFailed(
      latest,
      error.code || (upstream.status === "cancelled" ? "CANCELLED" : "GENERATION_FAILED"),
      error.message || (upstream.status === "cancelled" ? "任务已取消" : "课程生成失败"),
      upstream.status
    );
  }
  return getDoc(TASKS, latest.usageId);
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
  if (FORBIDDEN_PAYLOAD.test(topic) || FORBIDDEN_PAYLOAD.test(requirements)) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "输入中不能包含 HTML 或脚本" }, requestId);
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
      status: "submit_pending",
      upstreamStatus: "",
      progress: 1,
      importAttempts: 0,
      errorCode: null,
      errorMessage: null,
      deadlineAt: new Date(now.getTime() + MAX_JOB_MS),
      reconcileAfter: now,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    };
    await db.collection(TASKS).doc(usageId).set({ data: task });
    taskStored = true;
    const submitted = await reconcileOne(task);
    return makeResponse(true, { task: publicTask(submitted), idempotent: false }, requestId);
  } catch (err) {
    if (usageValidated && !taskStored) {
      try {
        await callUsageAction("failUsage", { userId: actor.userId, usageId }, {
          errorCode: err.code || "CREATE_TASK_FAILED",
          errorMessage: err.message || "创建任务失败",
        });
      } catch (releaseError) {
        console.error("release usage after task creation failure failed:", releaseError);
      }
    }
    return makeResponse(false, { code: err.code || "CREATE_TASK_FAILED", message: err.message || "创建任务失败" }, requestId);
  }
}

async function getTask(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const actor = resolveActor(event);
  if (!actor.ok) return makeResponse(false, actor.error, requestId);
  const usageId = getString(event.usageId);
  try {
    let task = await getDoc(TASKS, usageId);
    if (!task) return makeResponse(false, { code: "TASK_NOT_FOUND", message: "任务不存在" }, requestId);
    if (task.userId !== actor.userId) return makeResponse(false, { code: "FORBIDDEN", message: "无权访问该任务" }, requestId);
    const reconcileAt = task.reconcileAfter ? new Date(task.reconcileAfter).getTime() : 0;
    if (ACTIVE_STATUSES.includes(task.status) && reconcileAt <= Date.now()) task = await reconcileOne(task);
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
    if (!["succeeded", "failed", "cancelled", "timed_out"].includes(task.status)) {
      if (task.jobId) {
        try {
          await maicRequest("POST", `/api/integrations/huli-tools/v1/jobs/${task.jobId}/cancel`, {});
        } catch (err) {
          console.error("cancel MAIC job failed, releasing usage locally:", err);
        }
      }
      await markTaskFailed(task, "CANCELLED", "用户取消课程生成", "cancelled");
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
    return makeResponse(true, {
      protocol: course.protocol,
      scenes: (sceneRes.data || []).map((item) => item.scene),
      assetUrls,
    }, requestId);
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
    await db.collection(PROGRESS).doc(`${actor.userId}_${courseId}`).set({
      data: { userId: actor.userId, courseId, data, updatedAt: now, createdAt: now },
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

async function reconcileBatch(event, context) {
  const requestId = context.requestId || Date.now().toString();
  const authError = verifyInternal(event);
  if (authError) return makeResponse(false, authError, requestId);
  try {
    const res = await db.collection(TASKS)
      .where({ status: _.in(ACTIVE_STATUSES) })
      .orderBy("reconcileAfter", "asc")
      .limit(10)
      .get();
    const results = [];
    for (const task of res.data || []) {
      if (task.reconcileAfter && new Date(task.reconcileAfter).getTime() > Date.now()) continue;
      try {
        const updated = await reconcileOne(task);
        results.push({ usageId: task.usageId, status: updated && updated.status });
      } catch (err) {
        console.error("reconcile task failed:", task.usageId, err);
        results.push({ usageId: task.usageId, status: "error", error: err.message });
      }
    }
    return makeResponse(true, { processed: results.length, results }, requestId);
  } catch (err) {
    return makeResponse(false, { code: "RECONCILE_FAILED", message: err.message || "协调任务失败" }, requestId);
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
  if (action === "reconcileBatch") return reconcileBatch(event, context);
  return makeResponse(false, { code: "UNKNOWN_ACTION", message: "未知 action: " + action }, context.requestId || Date.now().toString());
};
