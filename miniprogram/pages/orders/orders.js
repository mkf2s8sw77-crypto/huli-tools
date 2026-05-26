const api = require("../../services/api");

const STATUS_MAP = {
  created: "已创建",
  pending_pay: "待支付",
  paid: "已支付",
  closed: "已关闭",
  failed: "失败",
  refunded: "已退款",
};

function formatDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

Page({
  data: {
    loading: false,
    orders: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: false,
  },

  onLoad() {
    this.loadOrders(true);
  },

  async loadOrders(reset) {
    const page = reset ? 1 : this.data.page;
    this.setData({ loading: true });
    try {
      const data = await api.listOrders(page, this.data.pageSize);
      const list = (data.list || []).map((o) => ({
        ...o,
        statusText: STATUS_MAP[o.status] || o.status,
        amountYuan: (o.amountFen / 100).toFixed(2),
        createdAtText: formatDate(o.createdAt),
        paidAtText: formatDate(o.paidAt),
      }));
      const hasMore = list.length === this.data.pageSize && (page * this.data.pageSize) < data.total;
      this.setData({
        orders: reset ? list : this.data.orders.concat(list),
        total: data.total || 0,
        page: page + 1,
        hasMore,
        loading: false,
      });
    } catch (err) {
      api.toastError(err);
      this.setData({ loading: false });
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadOrders(false);
    }
  },

  onRefresh() {
    this.loadOrders(true);
  },

  onPullDownRefresh() {
    this.loadOrders(true).then(() => {
      wx.stopPullDownRefresh();
    }).catch(() => {
      wx.stopPullDownRefresh();
    });
  },
});
