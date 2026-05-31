Component({
  properties: {
    text: { type: String, value: '确定' },
    btnType: { type: String, value: 'primary' },
    size: { type: String, value: 'default' },
    loading: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false }
  },
  methods: {
    onTap: function () {
      if (!this.data.loading && !this.data.disabled) {
        this.triggerEvent('tap')
      }
    }
  }
})
