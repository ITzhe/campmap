// components/privacy-popup/index.js
Component({
  data: {
    show: false,
    resolve: null
  },

  lifetimes: {
    attached() {
      // 监听微信隐私授权需要
      if (wx.onNeedPrivacyAuthorization) {
        wx.onNeedPrivacyAuthorization((resolve) => {
          this.setData({ show: true, resolve });
        });
      }
    }
  },

  methods: {
    onAgree() {
      if (this.data.resolve) {
        this.data.resolve({ buttonId: 'agree-btn', event: 'agree' });
      }
      this.setData({ show: false, resolve: null });
    },

    onReject() {
      if (this.data.resolve) {
        this.data.resolve({ event: 'disagree' });
      }
      this.setData({ show: false, resolve: null });
    }
  }
});
