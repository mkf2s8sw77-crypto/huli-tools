const api = require("../../services/api");

function fenToYuan(fen) {
  return (fen / 100).toFixed(2);
}

Page({
  data: {
    loading: false,
    packages: [],
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
      this.setData({ packages: list, loading: false });
    } catch (err) {
      api.toastError(err);
      this.setData({ loading: false });
    }
  },

  async onCreateOrder(e) {
    const pkg = e.currentTarget.dataset.pkg;
    if (!pkg) return;

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
      const pages = getCurrentPages();
      const prev = pages[pages.length - 2];
      if (prev && prev.loadProfile) {
        prev.loadProfile();
      }
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
