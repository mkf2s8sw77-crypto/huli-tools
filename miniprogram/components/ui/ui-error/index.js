Component({
  properties: {
    text: { type: String, value: '加载失败' },
    retryable: { type: Boolean, value: true }
  },
  methods: {
    onRetry: function () {
      this.triggerEvent('retry')
    }
  }
})
