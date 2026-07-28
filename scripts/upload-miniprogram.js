const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ENTRY_PAGE = "pages/index/index";

function readProjectConfig() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "project.config.json"), "utf8"));
}

async function main() {
  const version = process.argv[2];
  const desc = process.argv[3] || "huli-tools 小程序发布";

  if (!version) {
    throw new Error("缺少版本号，例如：1.0.1");
  }

  const projectConfig = readProjectConfig();
  const appId = projectConfig.appid;
  const privateKeyPath = path.join(ROOT, `private.${appId}.key`);
  const ciModuleDir = process.env.MINIPROGRAM_CI_MODULE_DIR;

  if (!appId) {
    throw new Error("project.config.json 未配置 appid");
  }

  if (!fs.existsSync(path.join(ROOT, "miniprogram", `${ENTRY_PAGE}.js`))) {
    throw new Error(`体验版入口不存在：${ENTRY_PAGE}`);
  }

  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(`缺少上传私钥：private.${appId}.key`);
  }

  if (!ciModuleDir) {
    throw new Error("未设置 MINIPROGRAM_CI_MODULE_DIR");
  }

  const ci = require(ciModuleDir);
  const project = new ci.Project({
    appid: appId,
    type: "miniProgram",
    projectPath: ROOT,
    privateKeyPath,
    ignores: [
      "node_modules/**/*",
      "admin-web/**/*",
      ".playwright-mcp/**/*",
      ".playwright-cli/**/*",
      "output/**/*",
      "tmp-preview/**/*",
      "cloudfunctions/**/*",
      "docs/**/*",
      "promptDocs/**/*",
      "templates/**/*",
    ],
  });

  const result = await ci.upload({
    project,
    version,
    desc,
    robot: 1,
    pagePath: ENTRY_PAGE,
    scene: 1011,
    setting: {
      es6: true,
      minify: true,
      codeProtect: false,
      autoPrefixWXSS: true,
    },
    onProgressUpdate(progress) {
      if (progress && progress.status === "done") {
        console.log(`[完成] ${progress.message || progress.id}`);
      }
    },
  });

  console.log(JSON.stringify({
    ok: true,
    appId,
    version,
    entryPage: ENTRY_PAGE,
    packageInfo: result.subPackageInfo || [],
  }));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
