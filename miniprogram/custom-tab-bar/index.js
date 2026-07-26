Component({
  data: {
    selected: 0,
    list: [
      { pagePath: "/pages/index/index", text: "工具", iconClass: "tab-icon--grid", active: true },
      { pagePath: "/pages/profile/profile", text: "我的", iconClass: "tab-icon--profile", active: false },
    ],
  },
  observers: {
    selected(value) {
      const selected = Number(value) || 0;
      this.setData({
        list: this.data.list.map((item, index) => ({
          ...item,
          active: index === selected,
        })),
      });
    },
  },
  methods: {
    switchTab(e) {
      const { index, path } = e.currentTarget.dataset;
      const selected = Number(index) || 0;
      this.setData({ selected });
      wx.switchTab({ url: path });
    },
  },
});
