const api = require("../../services/api");

function fenToYuan(fen) {
  return (fen / 100).toFixed(2);
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) {
          resolve(res.code);
        } else {
          reject(new Error("微信登录失败，请重试"));
        }
      },
      fail: () => reject(new Error("微信登录失败，请重试")),
    });
  });
}

function requestVirtualPayment(params) {
  return new Promise((resolve, reject) => {
    wx.requestVirtualPayment({
      mode: params.mode,
      signData: params.signData,
      paySig: params.paySig,
      signature: params.signature,
      success: () => resolve(),
      fail: (err) => reject(err),
    });
  });
}

Page({
  data: {
    loading: false,
    packages: [],
    provider: "mock",
    mockEnabled: false,
    creating: false,
    payingOrderNo: null,
    paying: false,
  },

  onLoad() {
    this.loadPackages();
  },

  async loadPackages() {
    this.setData({ loading: true });
    try {
      const data = await api.listPackages();
      const list = (data.list || []).map((p) => ({
        ...p,
        amountYuan: fenToYuan(p.amountFen),
      }));
      this.setData({
        packages: list,
        provider: data.provider || "mock",
        mockEnabled: !!data.mockEnabled,
        loading: false,
      });
    } catch (err) {
      api.toastError(err);
      this.setData({ loading: false });
    }
  },

  refreshPrevPage() {
    const pages = getCurrentPages();
    const prev = pages[pages.length - 2];
    if (prev && prev.loadProfile) {
      prev.loadProfile();
    }
  },

  async onTapPackage(e) {
    const pkg = e.currentTarget.dataset.pkg;
    if (!pkg) return;
    if (this.data.provider === "virtual") {
      await this.onVirtualPay(pkg);
    } else {
      await this.onCreateOrder(pkg);
    }
  },

  // mock / 未配置真实支付时的下单流程（开发测试用）
  async onCreateOrder(pkg) {
    this.setData({ creating: true });
    try {
      const data = await api.createOrder(pkg.packageKey);
      wx.showModal({
        title: "订单创建成功",
        content: `订单号: ${data.orderNo}\n金额: ${fenToYuan(data.amountFen)} 元\n到账积分: ${data.pointsTotal}`,
        showCancel: false,
        success: () => {
          this.setData({ payingOrderNo: data.orderNo });
        },
      });
    } catch (err) {
      api.toastError(err);
    } finally {
      this.setData({ creating: false });
    }
  },

  // 小程序虚拟支付：下单 -> 调起支付 -> 服务端查单确认到账
  async onVirtualPay(pkg) {
    if (this.data.creating) return;
    this.setData({ creating: true });
    let orderInfo = null;
    try {
      const code = await wxLogin();
      orderInfo = await api.createVirtualOrder(pkg.packageKey, code);
    } catch (err) {
      api.toastError(err);
      this.setData({ creating: false });
      return;
    }
    this.setData({ creating: false });

    try {
      await requestVirtualPayment(orderInfo);
    } catch (err) {
      const msg = (err && err.errMsg) || "";
      if (msg.includes("cancel")) {
        wx.showToast({ title: "已取消支付", icon: "none" });
      } else {
        wx.showToast({ title: msg || "支付失败，请重试", icon: "none" });
      }
      return;
    }

    // 支付动作完成，等待服务端确认到账（查单 + 推送双通道）
    this.setData({ paying: true, payingOrderNo: orderInfo.orderNo });
    try {
      await this.waitOrderPaid(orderInfo.orderNo);
      wx.showToast({ title: "充值成功", icon: "success" });
      this.refreshPrevPage();
    } catch (err) {
      wx.showModal({
        title: "支付结果确认中",
        content: "支付已完成，积分到账可能有延迟，请稍后在「我的订单」中查看",
        showCancel: false,
      });
    } finally {
      this.setData({ paying: false, payingOrderNo: null });
    }
  },

  // 先主动查单确认；未支付则轮询订单状态等待发货推送
  async waitOrderPaid(orderNo) {
    try {
      await api.confirmVirtualOrder(orderNo);
      return;
    } catch (err) {
      if (err.code !== "ORDER_NOT_PAID") {
        throw err;
      }
    }
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 2000));
      const order = await api.getOrder(orderNo);
      if (order.status === "paid") {
        return;
      }
    }
    throw new Error("订单到账确认超时");
  },

  async onMockPay() {
    const orderNo = this.data.payingOrderNo;
    if (!orderNo) {
      wx.showToast({ title: "请先创建订单", icon: "none" });
      return;
    }

    this.setData({ paying: true });
    try {
      await api.mockPayOrder(orderNo);
      wx.showToast({ title: "模拟支付成功", icon: "success" });
      this.setData({ payingOrderNo: null });
      // 支付成功后返回上一页或刷新
      this.refreshPrevPage();
    } catch (err) {
      api.toastError(err);
    } finally {
      this.setData({ paying: false });
    }
  },

  onGoOrders() {
    wx.navigateTo({ url: "/pages/orders/orders" });
  },
});
