const api = require("../../services/api");

const STATUS_MAP = {
  created: "已创建",
  frozen: "已冻结",
  succeeded: "成功",
  failed: "失败",
  released: "已释放",
};

const STATUS_COLOR = {
  created: "#999",
  frozen: "#ff9900",
  succeeded: "#07c160",
  failed: "#fa5151",
  released: "#576b95",
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
      const data = await api.listUsageRecords(page, this.data.pageSize);
      const list = (data.list || []).map((item) => ({
        ...item,
        statusText: STATUS_MAP[item.status] || item.status,
        statusColor: STATUS_COLOR[item.status] || "#999",
        startedAtText: formatDate(item.startedAt),
        finishedAtText: formatDate(item.finishedAt),
      }));
      const hasMore = list.length === this.data.pageSize && (page * this.data.pageSize) < data.total;
      this.setData({
        list: reset ? list : this.data.list.concat(list),
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
