const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const APP_KEY = "ai_draw";
const TASK_COLLECTION = "app_ai_draw_tasks";
const GPT_IMAGE_API_HOST = "dev.huli.sh.cn";
const GPT_IMAGE_API_BASE = "/gpt-image-2";
const MODE = "nurse_portrait";
const UPLOAD_PREFIX = "app_ai_draw_uploads";
const ASSET_RETENTION_DAYS = 7;
const MAX_REFERENCE_ASSETS = 8;
const MAX_REQUIREMENTS_LENGTH = 300;
const MAX_GENERATED_PROMPT_LENGTH = 1900;

const COMPOSITION_OPTIONS = {
  half_body: "半身职业照，胸部以上到腰部附近，适合工作照和头像",
  full_body: "全身职业照，站姿端正，完整展示护士制服和整体形象",
  id_photo: "证件照构图，正面半身，纯净背景，适合标准照",
};

function makeResponse(ok, dataOrError, requestId) {
  if (ok) {
    return { ok: true, data: dataOrError || {}, requestId };
  }
  return { ok: false, error: dataOrError || { code: "UNKNOWN", message: "未知错误" }, requestId };
}

function getInternalToken() {
  return process.env.INTERNAL_API_SECRET || "";
}

function buildUsageActionData(openid, data) {
  const token = getInternalToken();
  if (!token) {
    return data;
  }
  return {
    ...data,
    _internalToken: token,
    userId: openid,
  };
}

function getString(value) {
  return typeof value === "string" ? value : "";
}

function getNumber(value) {
  return typeof value === "number" ? value : null;
}

function getTimeValue(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getRetentionExpiresAt() {
  return new Date(Date.now() + ASSET_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function getImageUrl(result) {
  const images = result && Array.isArray(result.images) ? result.images : [];
  return images[0] && images[0].public_url ? images[0].public_url : null;
}

function getResultImages(result) {
  const images = result && Array.isArray(result.images) ? result.images : [];
  return images
    .filter((image) => image && image.public_url)
    .map((image) => ({
      public_url: image.public_url,
      object_key: image.object_key || "",
      content_type: image.content_type || "image/png",
      size_bytes: image.size_bytes || 0,
    }));
}

function getUpstreamErrorInfo(result, fallbackMessage) {
  const error = result && result.error && typeof result.error === "object" ? result.error : {};
  return {
    stage: getString(result && result.stage) || getString(error.stage),
    message: getString(result && result.message) || getString(error.message) || fallbackMessage || "图片生成失败",
    retryAfterSeconds: getNumber(result && result.retry_after_seconds) || getNumber(error.retry_after_seconds),
    activeJobId: getString(result && result.active_job_id) || getString(error.active_job_id),
  };
}

function normalizeGenerationError(result, fallbackMessage) {
  const info = getUpstreamErrorInfo(result, fallbackMessage);
  const stage = info.stage.toLowerCase();
  if (stage === "rate_limited" || info.activeJobId || info.message.indexOf("操作正在进行中") !== -1) {
    return {
      code: "GENERATION_BUSY",
      message: "生图服务正在处理上一张图片，请稍后再试",
      upstreamStage: info.stage,
      upstreamMessage: info.message,
      retryAfterSeconds: info.retryAfterSeconds,
      activeJobId: info.activeJobId,
    };
  }
  if (stage === "ui_changed" || stage === "worker_unavailable" || info.message === "fetch failed") {
    return {
      code: "GENERATION_SERVICE_UNAVAILABLE",
      message: "生图服务暂时不可用，请稍后再试",
      upstreamStage: info.stage,
      upstreamMessage: info.message,
    };
  }
  return {
    code: "GENERATION_FAILED",
    message: info.message,
    upstreamStage: info.stage,
    upstreamMessage: info.message,
  };
}

function httpsRequest(hostname, path, method, postData) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 10000,
    };
    const req = require("https").request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("请求超时"));
    });
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

function safeFilename(filename, fallback) {
  const raw = getString(filename) || fallback || "image.jpg";
  const cleaned = raw
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return cleaned || fallback || "image.jpg";
}

function normalizeImageExtension(filename) {
  const safe = safeFilename(filename, "image.jpg");
  const parts = safe.split(".");
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : "jpg";
  return ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
}

function normalizeUploadRole(role) {
  const value = getString(role).trim();
  return value === "subject" || value === "reference" ? value : "";
}

function normalizeOptions(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const composition = COMPOSITION_OPTIONS[source.composition] ? source.composition : "half_body";
  const requirements = getString(source.requirements).trim();
  if (requirements.length > MAX_REQUIREMENTS_LENGTH) {
    return {
      ok: false,
      error: { code: "INVALID_PARAM", message: "补充要求不能超过 300 字" },
    };
  }
  return {
    ok: true,
    options: {
      composition,
      requirements,
    },
  };
}

function normalizeAsset(raw, expectedRole) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const role = normalizeUploadRole(raw.role || expectedRole);
  const fileID = getString(raw.fileID).trim();
  const cloudPath = getString(raw.cloudPath).trim();
  const name = getString(raw.name).trim().slice(0, 80);
  if (!role || !fileID || !cloudPath) {
    return null;
  }
  return {
    role,
    fileID,
    cloudPath,
    name: name || (role === "subject" ? "主体形象照" : "参考图"),
  };
}

function validateAssetOwnership(asset, openid) {
  const allowedPrefix = `${UPLOAD_PREFIX}/${openid}/`;
  if (!asset.cloudPath.startsWith(allowedPrefix)) {
    return false;
  }
  return asset.fileID.indexOf(asset.cloudPath) !== -1;
}

function toStoredAsset(asset) {
  return {
    role: asset.role,
    fileID: asset.fileID,
    cloudPath: asset.cloudPath,
    name: asset.name,
  };
}

async function getTempUrlsForAssets(assets) {
  const fileList = assets.map((asset) => asset.fileID);
  const res = await cloud.getTempFileURL({ fileList });
  const list = res.fileList || [];
  return assets.map((asset, index) => {
    const item = list[index] || {};
    if (item.status !== 0 || !item.tempFileURL) {
      throw new Error(`素材不可访问: ${asset.name}`);
    }
    return {
      role: asset.role,
      name: asset.name,
      url: item.tempFileURL,
    };
  });
}

function buildNursePortraitPrompt(options, referenceCount) {
  const lines = [
    "请基于已上传图片生成 1 张护士职业定妆照。",
    "第 1 张上传图片是主体形象照：必须保留本人面部五官、脸型、发型气质和真实年龄感，只做自然职业照级别的光线与肤色优化，不要把人物变成另一个人。",
  ];

  if (referenceCount > 0) {
    lines.push(
      `后续 ${referenceCount} 张上传图片是参考图：用于参考护士制服、衣服颜色、背景、医院 Logo、护士帽样式、色彩氛围或构图元素；只采用参考图中清晰可见的内容。`
    );
  } else {
    lines.push("没有额外参考图时，使用干净、专业、通用的护士职业照风格。");
  }

  lines.push(
    `构图要求：${COMPOSITION_OPTIONS[options.composition]}`,
    "职业要求：真实摄影风格，画面明亮干净，姿态端正自信，适合医院护士工作照、标准照或宣传展示。",
    "制服要求：优先参考上传图片中的衣服和护士帽；如果参考图不清晰，则使用整洁、合身、专业的护士制服。",
    "背景要求：优先参考上传图片中的背景或色彩；如果没有明确背景，则使用简洁柔和的浅色影棚或医院职业照背景。",
    "Logo 要求：只有当参考图中有清晰医院 Logo 或标识时才自然融入，不能虚构医院名称、科室、文字、徽章或水印。",
    "输出要求：只生成单张完整图片，不要拼图、不要前后对比、不要说明文字、不要二维码、不要水印。"
  );

  if (options.requirements) {
    lines.push("用户补充要求：" + options.requirements);
  }

  const prompt = lines.join("\n");
  return prompt.length > MAX_GENERATED_PROMPT_LENGTH
    ? prompt.slice(0, MAX_GENERATED_PROMPT_LENGTH)
    : prompt;
}

async function validateUsage(usageId, openid, requestId, allowedStatuses) {
  let usage;
  try {
    const usageRes = await db.collection("app_usage_records").doc(usageId).get();
    usage = usageRes.data || null;
  } catch (err) {
    return { ok: false, response: makeResponse(false, { code: "DB_ERROR", message: "查询使用记录失败: " + err.message }, requestId) };
  }

  if (!usage) {
    return { ok: false, response: makeResponse(false, { code: "USAGE_NOT_FOUND", message: "使用记录不存在" }, requestId) };
  }
  if (usage.userId !== openid) {
    return { ok: false, response: makeResponse(false, { code: "FORBIDDEN", message: "无权操作该使用记录" }, requestId) };
  }
  if (usage.appKey !== APP_KEY) {
    return { ok: false, response: makeResponse(false, { code: "APP_MISMATCH", message: "使用记录不属于护士职业定妆照应用" }, requestId) };
  }
  const statuses = allowedStatuses || ["frozen", "created"];
  if (!statuses.includes(usage.status)) {
    return { ok: false, response: makeResponse(false, { code: "INVALID_STATUS", message: "使用记录状态不可执行" }, requestId) };
  }

  return { ok: true, usage };
}

async function callFinishUsage(openid, usageId, resultRef, requestId) {
  try {
    const finishRes = await cloud.callFunction({
      name: "coreApp",
      data: buildUsageActionData(openid, {
        action: "finishUsage",
        usageId,
        resultRef,
      }),
    });
    const finishResult = finishRes.result;
    if (!finishResult || !finishResult.ok) {
      const error = finishResult && finishResult.error ? finishResult.error : { code: "FINISH_FAILED", message: "结算失败" };
      if (error.code === "USAGE_ALREADY_FINISHED") {
        return { ok: true, alreadyFinished: true };
      }
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: { code: "FINISH_FAILED", message: "结算调用失败: " + err.message } };
  }
}

async function callFailUsage(openid, usageId, errorCode, errorMessage, requestId) {
  try {
    const failRes = await cloud.callFunction({
      name: "coreApp",
      data: buildUsageActionData(openid, {
        action: "failUsage",
        usageId,
        errorCode: errorCode || "BIZ_ERROR",
        errorMessage: errorMessage || "业务执行失败",
      }),
    });
    const failResult = failRes.result;
    if (!failResult || !failResult.ok) {
      const error = failResult && failResult.error ? failResult.error : { code: "FAIL_USAGE_FAILED", message: "释放积分失败" };
      if (error.code === "USAGE_ALREADY_FAILED") {
        return { ok: true, alreadyFailed: true };
      }
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: { code: "FAIL_USAGE_FAILED", message: "释放积分调用失败: " + err.message } };
  }
}

async function createGenerationTask(payload) {
  return httpsRequest(
    GPT_IMAGE_API_HOST,
    GPT_IMAGE_API_BASE + "/api/generations",
    "POST",
    payload
  );
}

async function getTask(usageId) {
  try {
    const res = await db.collection(TASK_COLLECTION).doc(usageId).get();
    return res.data || null;
  } catch (err) {
    return null;
  }
}

async function getTaskByJobId(jobId, openid) {
  if (!jobId) return null;
  try {
    const res = await db.collection(TASK_COLLECTION)
      .where({ jobId, userId: openid })
      .limit(1)
      .get();
    return res.data && res.data[0] ? res.data[0] : null;
  } catch (err) {
    return null;
  }
}

async function getUserProcessingTasks(openid) {
  try {
    const res = await db.collection(TASK_COLLECTION)
      .where({ userId: openid })
      .limit(20)
      .get();
    return (res.data || [])
      .filter((task) => task.status === "processing" && task.usageId && task.jobId)
      .sort((a, b) => getTimeValue(b.updatedAt || b.createdAt) - getTimeValue(a.updatedAt || a.createdAt));
  } catch (err) {
    return [];
  }
}

async function saveTask(data) {
  const now = new Date();
  await db.collection(TASK_COLLECTION).doc(data.usageId).set({
    data: {
      mode: data.mode || MODE,
      userId: data.userId,
      usageId: data.usageId,
      jobId: data.jobId,
      prompt: data.prompt,
      generatedPrompt: data.generatedPrompt || data.prompt,
      subjectAsset: data.subjectAsset || null,
      referenceAssets: data.referenceAssets || [],
      options: data.options || {},
      status: data.status,
      imageUrl: data.imageUrl || null,
      images: data.images || [],
      errorCode: data.errorCode || null,
      errorMessage: data.errorMessage || null,
      expiresAt: data.expiresAt || getRetentionExpiresAt(),
      createdAt: data.createdAt || now,
      updatedAt: now,
      finishedAt: data.finishedAt || null,
    },
  });
}

async function updateTask(usageId, data) {
  try {
    await db.collection(TASK_COLLECTION).doc(usageId).update({
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("更新护士定妆照任务失败:", err.message);
  }
}

async function validateTask(usageId, jobId, openid, requestId) {
  const task = await getTask(usageId);
  if (!task) {
    return { ok: false, response: makeResponse(false, { code: "TASK_NOT_FOUND", message: "护士定妆照任务不存在或未创建成功" }, requestId) };
  }
  if (task.userId !== openid) {
    return { ok: false, response: makeResponse(false, { code: "FORBIDDEN", message: "无权操作该任务" }, requestId) };
  }
  if (task.jobId !== jobId) {
    return { ok: false, response: makeResponse(false, { code: "JOB_MISMATCH", message: "任务编号与使用记录不匹配" }, requestId) };
  }
  return { ok: true, task };
}

async function queryGenerationStatus(jobId) {
  return httpsRequest(
    GPT_IMAGE_API_HOST,
    GPT_IMAGE_API_BASE + "/api/generations/" + jobId,
    "GET"
  );
}

async function finishWithImages(openid, usageId, jobId, result, requestId) {
  const imageUrl = getImageUrl(result);
  const images = getResultImages(result);
  if (!imageUrl) {
    return failGeneration(openid, usageId, jobId, "API_ERROR", "任务成功但未返回图片 URL", requestId);
  }
  const finishRes = await callFinishUsage(openid, usageId, imageUrl, requestId);
  if (!finishRes.ok) {
    return makeResponse(false, finishRes.error, requestId);
  }
  await updateTask(usageId, {
    status: "succeeded",
    imageUrl,
    images,
    errorCode: null,
    errorMessage: null,
    finishedAt: new Date(),
  });
  return makeResponse(true, { imageUrl, images, status: "succeeded", jobId }, requestId);
}

async function failGeneration(openid, usageId, jobId, errorCode, errorMessage, requestId) {
  const failRes = await callFailUsage(openid, usageId, errorCode, errorMessage, requestId);
  await updateTask(usageId, {
    status: "failed",
    errorCode,
    errorMessage,
    finishedAt: new Date(),
  });
  if (!failRes.ok) {
    return makeResponse(false, failRes.error, requestId);
  }
  return makeResponse(false, { code: errorCode, message: errorMessage }, requestId);
}

async function prepareUpload(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const role = normalizeUploadRole(event.role);

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!role) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "上传类型必须是 subject 或 reference" }, requestId);
  }

  const now = Date.now();
  const ext = normalizeImageExtension(event.filename);
  const filename = `${role}-${now}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const cloudPath = `${UPLOAD_PREFIX}/${openid}/${now}/${filename}`;

  return makeResponse(true, {
    role,
    cloudPath,
    expiresAt: getRetentionExpiresAt().toISOString(),
  }, requestId);
}

async function syncProcessingTask(openid, task, requestId) {
  const usageCheck = await validateUsage(task.usageId, openid, requestId, ["created", "frozen", "succeeded"]);
  if (!usageCheck.ok) {
    return null;
  }

  let queryResult;
  try {
    queryResult = await queryGenerationStatus(task.jobId);
  } catch (err) {
    await updateTask(task.usageId, { status: "processing", errorCode: "POLL_ERROR", errorMessage: err.message });
    return makeResponse(true, {
      status: "processing",
      usageId: task.usageId,
      jobId: task.jobId,
      prompt: task.generatedPrompt || task.prompt || "",
      lastError: "查询任务状态失败: " + err.message,
    }, requestId);
  }

  if (queryResult.status === "succeeded") {
    const response = await finishWithImages(openid, task.usageId, task.jobId, queryResult, requestId);
    if (response.ok) {
      response.data.usageId = task.usageId;
      response.data.prompt = task.generatedPrompt || task.prompt || "";
    }
    return response;
  }

  if (queryResult.status === "failed") {
    const error = normalizeGenerationError(queryResult, "图片生成失败");
    await failGeneration(openid, task.usageId, task.jobId, error.code, error.message, requestId);
    return null;
  }

  await updateTask(task.usageId, { status: "processing" });
  return makeResponse(true, {
    status: "processing",
    usageId: task.usageId,
    jobId: task.jobId,
    prompt: task.generatedPrompt || task.prompt || "",
  }, requestId);
}

async function generate(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { usageId } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!usageId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 usageId" }, requestId);
  }

  const usageCheck = await validateUsage(usageId, openid, requestId);
  if (!usageCheck.ok) {
    return usageCheck.response;
  }

  const existingTask = await getTask(usageId);
  if (existingTask) {
    if (existingTask.userId !== openid) {
      return makeResponse(false, { code: "FORBIDDEN", message: "无权操作该任务" }, requestId);
    }
    if (existingTask.status === "succeeded" && existingTask.imageUrl) {
      return makeResponse(true, {
        imageUrl: existingTask.imageUrl,
        images: existingTask.images || [],
        status: "succeeded",
        jobId: existingTask.jobId,
      }, requestId);
    }
    if (existingTask.status === "processing") {
      return makeResponse(true, { status: "processing", jobId: existingTask.jobId }, requestId);
    }
    if (existingTask.status === "failed" || existingTask.status === "cancelled") {
      return makeResponse(false, { code: "TASK_ALREADY_FAILED", message: existingTask.errorMessage || "任务已失败" }, requestId);
    }
  }

  const subjectAsset = normalizeAsset(event.subjectAsset, "subject");
  const referenceAssets = Array.isArray(event.referenceAssets)
    ? event.referenceAssets.map((asset) => normalizeAsset(asset, "reference")).filter(Boolean)
    : [];
  const optionsResult = normalizeOptions(event.options);

  if (!subjectAsset) {
    await callFailUsage(openid, usageId, "MISSING_SUBJECT", "请先上传主体形象照", requestId);
    return makeResponse(false, { code: "MISSING_SUBJECT", message: "请先上传主体形象照" }, requestId);
  }
  if (!optionsResult.ok) {
    await callFailUsage(openid, usageId, optionsResult.error.code, optionsResult.error.message, requestId);
    return makeResponse(false, optionsResult.error, requestId);
  }
  if (referenceAssets.length > MAX_REFERENCE_ASSETS) {
    await callFailUsage(openid, usageId, "TOO_MANY_REFERENCES", "参考图最多上传 8 张", requestId);
    return makeResponse(false, { code: "TOO_MANY_REFERENCES", message: "参考图最多上传 8 张" }, requestId);
  }

  const allAssets = [subjectAsset, ...referenceAssets];
  const invalidAsset = allAssets.find((asset) => !validateAssetOwnership(asset, openid));
  if (invalidAsset) {
    await callFailUsage(openid, usageId, "ASSET_FORBIDDEN", "素材路径无权使用", requestId);
    return makeResponse(false, { code: "ASSET_FORBIDDEN", message: "素材路径无权使用" }, requestId);
  }

  let inputImages;
  try {
    inputImages = await getTempUrlsForAssets(allAssets);
  } catch (err) {
    await callFailUsage(openid, usageId, "ASSET_NOT_FOUND", err.message, requestId);
    return makeResponse(false, { code: "ASSET_NOT_FOUND", message: err.message }, requestId);
  }

  const options = optionsResult.options;
  const generatedPrompt = buildNursePortraitPrompt(options, referenceAssets.length);
  const expiresAt = getRetentionExpiresAt();

  let createResult;
  try {
    createResult = await createGenerationTask({
      prompt: generatedPrompt,
      input_images: inputImages,
      image_count: 1,
      metadata: {
        app_key: APP_KEY,
        mode: MODE,
        usage_id: usageId,
        reference_count: referenceAssets.length,
        composition: options.composition,
      },
    });
  } catch (err) {
    await callFailUsage(openid, usageId, "API_ERROR", "创建图片生成任务失败: " + err.message, requestId);
    return makeResponse(false, { code: "API_ERROR", message: "创建图片生成任务失败: " + err.message }, requestId);
  }

  if (!createResult || !createResult.ok) {
    const error = normalizeGenerationError(createResult, "创建任务失败");
    if (error.code === "GENERATION_BUSY" && error.activeJobId) {
      const activeTask = await getTaskByJobId(error.activeJobId, openid);
      if (activeTask && activeTask.status === "processing") {
        await callFailUsage(openid, usageId, "GENERATION_SUPERSEDED", "已合并到正在生成的任务", requestId);
        return makeResponse(true, {
          status: "processing",
          jobId: activeTask.jobId,
          usageId: activeTask.usageId,
          reused: true,
        }, requestId);
      }
    }
    await callFailUsage(openid, usageId, error.code, error.message, requestId);
    return makeResponse(false, error, requestId);
  }

  const jobId = createResult.job_id;
  if (!jobId) {
    await callFailUsage(openid, usageId, "API_ERROR", "任务创建未返回 job_id", requestId);
    return makeResponse(false, { code: "API_ERROR", message: "任务创建未返回 job_id" }, requestId);
  }

  try {
    await saveTask({
      mode: MODE,
      userId: openid,
      usageId,
      jobId,
      prompt: generatedPrompt,
      generatedPrompt,
      subjectAsset: toStoredAsset(subjectAsset),
      referenceAssets: referenceAssets.map(toStoredAsset),
      options,
      status: "processing",
      expiresAt,
    });
  } catch (err) {
    await callFailUsage(openid, usageId, "TASK_RECORD_FAILED", "保存定妆照任务失败: " + err.message, requestId);
    return makeResponse(false, { code: "TASK_RECORD_FAILED", message: "保存定妆照任务失败，请确认 app_ai_draw_tasks 集合已创建" }, requestId);
  }

  return makeResponse(true, { status: "processing", jobId }, requestId);
}

async function latest(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }

  const tasks = await getUserProcessingTasks(openid);
  for (const task of tasks) {
    const response = await syncProcessingTask(openid, task, requestId);
    if (response && response.ok) {
      return response;
    }
  }

  return makeResponse(true, { status: "none" }, requestId);
}

async function query(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { jobId, usageId } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!jobId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 jobId" }, requestId);
  }
  if (!usageId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 usageId" }, requestId);
  }

  const usageCheck = await validateUsage(usageId, openid, requestId, ["created", "frozen", "succeeded"]);
  if (!usageCheck.ok) {
    return usageCheck.response;
  }

  const taskCheck = await validateTask(usageId, jobId, openid, requestId);
  if (!taskCheck.ok) {
    return taskCheck.response;
  }
  if (taskCheck.task.status === "succeeded" && taskCheck.task.imageUrl) {
    return makeResponse(true, {
      imageUrl: taskCheck.task.imageUrl,
      images: taskCheck.task.images || [],
      status: "succeeded",
      jobId,
    }, requestId);
  }
  if (taskCheck.task.status === "failed" || taskCheck.task.status === "cancelled") {
    return makeResponse(false, { code: "TASK_ALREADY_FAILED", message: taskCheck.task.errorMessage || "任务已失败" }, requestId);
  }

  let queryResult;
  try {
    queryResult = await queryGenerationStatus(jobId);
  } catch (err) {
    await updateTask(usageId, { status: "processing", errorCode: "POLL_ERROR", errorMessage: err.message });
    return makeResponse(true, { status: "processing", jobId, lastError: "查询任务状态失败: " + err.message }, requestId);
  }

  if (queryResult.status === "succeeded") {
    return finishWithImages(openid, usageId, jobId, queryResult, requestId);
  }

  if (queryResult.status === "failed") {
    const error = normalizeGenerationError(queryResult, "图片生成失败");
    return failGeneration(openid, usageId, jobId, error.code, error.message, requestId);
  }

  await updateTask(usageId, { status: "processing" });
  return makeResponse(true, { status: "processing", jobId }, requestId);
}

async function cancel(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const requestId = context.requestId || Date.now().toString();
  const { jobId, usageId, reason } = event;

  if (!openid) {
    return makeResponse(false, { code: "UNAUTHORIZED", message: "无法获取用户身份" }, requestId);
  }
  if (!usageId || !jobId) {
    return makeResponse(false, { code: "INVALID_PARAM", message: "缺少 usageId 或 jobId" }, requestId);
  }

  const usageCheck = await validateUsage(usageId, openid, requestId, ["created", "frozen"]);
  if (!usageCheck.ok) {
    return usageCheck.response;
  }
  const taskCheck = await validateTask(usageId, jobId, openid, requestId);
  if (!taskCheck.ok) {
    return taskCheck.response;
  }

  const message = reason || "用户取消或等待超时";
  const failRes = await callFailUsage(openid, usageId, "GENERATION_CANCELLED", message, requestId);
  await updateTask(usageId, {
    status: "cancelled",
    errorCode: "GENERATION_CANCELLED",
    errorMessage: message,
    finishedAt: new Date(),
  });
  if (!failRes.ok) {
    return makeResponse(false, failRes.error, requestId);
  }
  return makeResponse(true, { status: "cancelled", jobId }, requestId);
}

async function cleanupExpiredAssets(event, context) {
  const requestId = context.requestId || Date.now().toString();
  if (!event._internalToken || event._internalToken !== getInternalToken()) {
    return makeResponse(false, { code: "FORBIDDEN", message: "无权清理素材" }, requestId);
  }

  let tasks;
  try {
    const res = await db.collection(TASK_COLLECTION)
      .where({
        expiresAt: _.lt(new Date()),
        assetCleanedAt: _.exists(false),
      })
      .limit(100)
      .get();
    tasks = res.data || [];
  } catch (err) {
    return makeResponse(false, { code: "DB_ERROR", message: "查询过期素材失败: " + err.message }, requestId);
  }

  let deleted = 0;
  for (const task of tasks) {
    const files = [];
    if (task.subjectAsset && task.subjectAsset.fileID) files.push(task.subjectAsset.fileID);
    (task.referenceAssets || []).forEach((asset) => {
      if (asset && asset.fileID) files.push(asset.fileID);
    });
    if (files.length) {
      await cloud.deleteFile({ fileList: files }).catch(() => {});
      deleted += files.length;
    }
    await updateTask(task.usageId || task._id, { assetCleanedAt: new Date() });
  }

  return makeResponse(true, { tasks: tasks.length, deleted }, requestId);
}

exports.main = async (event, context) => {
  const { action } = event;
  const requestId = context.requestId || Date.now().toString();

  if (action === "prepareUpload") {
    return prepareUpload(event, context);
  }
  if (action === "generate") {
    return generate(event, context);
  }
  if (action === "query") {
    return query(event, context);
  }
  if (action === "latest") {
    return latest(event, context);
  }
  if (action === "cancel") {
    return cancel(event, context);
  }
  if (action === "cleanupExpiredAssets") {
    return cleanupExpiredAssets(event, context);
  }

  return makeResponse(false, { code: "UNKNOWN_ACTION", message: "未知 action: " + action }, requestId);
};
