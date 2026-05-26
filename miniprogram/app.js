App({
  onLaunch() {
    wx.cloud.init({
      env: "cloudbase-3gphz7fk0fe1b760",
      traceUser: true,
    });
    console.log("CloudBase initialized");
  },
});
