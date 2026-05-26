const api = require("../../services/api");

const TYPE_MAP = {
  freeze: "冻结积分",
  settle: "结算扣费",
  release: "释放积分",
  recharge: "充值到账",
  admin_adjust: "管理员调整",
};

const TYPE_COLOR = {
  freeze: "#ff9900",
  settle: "#fa5151",
  release: "#07c160",
  recharge: "#07c160",
  admin_adjust: "#576b95",
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
    list: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: false,
  },

  onLoad() {
    this.loadData(true);
  },

  async loadData(reset) {
    const page = reset ? 1 : this.data.page;
    this.setData({ loading: true });
    try {
      const data = await api.listTransactions(page, this.data.pageSize);
      const list = (data.list || []).map((item) => ({
        ...item,
        typeText: TYPE_MAP[item.type] || item.type,
        typeColor: TYPE_COLOR[item.type] || "#666",
        deltaAvailableText: item.deltaAvailable > 0 ? `+${item.deltaAvailable}` : String(item.deltaAvailable),
        deltaFrozenText: item.deltaFrozen > 0 ? `+${item.deltaFrozen}` : String(item.deltaFrozen),
        createdAtText: formatDate(item.createdAt),
      }));
      const hasMore = list.length === this.data.pageSize && (page * this.data.pageSize) < data.total;
      this.setData({
        list: reset ? list : this.data.list.concat(list),
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
      this.loadData(false);
    }
  },

  onRefresh() {
    this.loadData(true);
  },

  onPullDownRefresh() {
    this.loadData(true).then(() => {
      wx.stopPullDownRefresh();
    }).catch(() => {
      wx.stopPullDownRefresh();
    });
  },
});
