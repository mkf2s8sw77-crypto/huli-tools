Component({
  data: {
    selected: 0,
    list: [
      { pagePath: "/pages/index/index", text: "首页", iconClass: "tab-icon--home", active: true },
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
