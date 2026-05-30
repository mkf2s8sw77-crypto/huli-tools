import cloudbase from "@cloudbase/js-sdk";

const ENV_ID = import.meta.env.VITE_CLOUDBASE_ENV_ID || "cloudbase-3gphz7fk0fe1b760";

const app = cloudbase.init({ env: ENV_ID });
const auth = app.auth({ persistence: "local" });

export { app, auth, ENV_ID };
