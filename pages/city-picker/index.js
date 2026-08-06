// pages/city-picker/index.js — 城市选择页
const config = require('../../utils/config');

// 全国主要城市列表（含坐标）
const CITY_LIST = [
  // 直辖市
  { name: '北京', lat: 39.9042, lng: 116.4074, province: '直辖市' },
  { name: '上海', lat: 31.2304, lng: 121.4737, province: '直辖市' },
  { name: '天津', lat: 39.0842, lng: 117.2009, province: '直辖市' },
  { name: '重庆', lat: 29.5630, lng: 106.5516, province: '直辖市' },

  // 华北
  { name: '石家庄', lat: 38.0428, lng: 114.5149, province: '河北省' },
  { name: '唐山', lat: 39.6306, lng: 118.1804, province: '河北省' },
  { name: '秦皇岛', lat: 39.9354, lng: 119.6005, province: '河北省' },
  { name: '保定', lat: 38.8740, lng: 115.4646, province: '河北省' },
  { name: '张家口', lat: 40.7686, lng: 114.8869, province: '河北省' },
  { name: '承德', lat: 40.9510, lng: 117.9626, province: '河北省' },
  { name: '太原', lat: 37.8706, lng: 112.5489, province: '山西省' },
  { name: '大同', lat: 40.0768, lng: 113.3001, province: '山西省' },
  { name: '呼和浩特', lat: 40.8426, lng: 111.7491, province: '内蒙古自治区' },
  { name: '包头', lat: 40.6574, lng: 109.8403, province: '内蒙古自治区' },
  { name: '鄂尔多斯', lat: 39.6087, lng: 109.7814, province: '内蒙古自治区' },

  // 东北
  { name: '沈阳', lat: 41.8057, lng: 123.4315, province: '辽宁省' },
  { name: '大连', lat: 38.9140, lng: 121.6147, province: '辽宁省' },
  { name: '丹东', lat: 40.1295, lng: 124.3936, province: '辽宁省' },
  { name: '长春', lat: 43.8171, lng: 125.3235, province: '吉林省' },
  { name: '吉林', lat: 43.8378, lng: 126.5500, province: '吉林省' },
  { name: '延边', lat: 42.8917, lng: 129.5097, province: '吉林省' },
  { name: '哈尔滨', lat: 45.8038, lng: 126.5350, province: '黑龙江省' },
  { name: '齐齐哈尔', lat: 47.3540, lng: 123.9182, province: '黑龙江省' },
  { name: '牡丹江', lat: 44.5527, lng: 129.6329, province: '黑龙江省' },
  { name: '大兴安岭', lat: 50.7456, lng: 124.1058, province: '黑龙江省' },

  // 华东
  { name: '南京', lat: 32.0603, lng: 118.7969, province: '江苏省' },
  { name: '苏州', lat: 31.2989, lng: 120.5853, province: '江苏省' },
  { name: '无锡', lat: 31.4912, lng: 120.3119, province: '江苏省' },
  { name: '常州', lat: 31.7727, lng: 119.9469, province: '江苏省' },
  { name: '南通', lat: 31.9802, lng: 120.8942, province: '江苏省' },
  { name: '盐城', lat: 33.3776, lng: 120.1573, province: '江苏省' },
  { name: '徐州', lat: 34.2058, lng: 117.2839, province: '江苏省' },
  { name: '连云港', lat: 34.5969, lng: 119.2216, province: '江苏省' },
  { name: '杭州', lat: 30.2741, lng: 120.1551, province: '浙江省' },
  { name: '宁波', lat: 29.8683, lng: 121.5440, province: '浙江省' },
  { name: '温州', lat: 28.0016, lng: 120.6720, province: '浙江省' },
  { name: '绍兴', lat: 30.0303, lng: 120.5848, province: '浙江省' },
  { name: '金华', lat: 29.0784, lng: 119.6474, province: '浙江省' },
  { name: '舟山', lat: 29.9853, lng: 122.2072, province: '浙江省' },
  { name: '合肥', lat: 31.8206, lng: 117.2272, province: '安徽省' },
  { name: '黄山', lat: 29.7147, lng: 118.3374, province: '安徽省' },
  { name: '芜湖', lat: 31.3345, lng: 118.4326, province: '安徽省' },
  { name: '福州', lat: 26.0745, lng: 119.2965, province: '福建省' },
  { name: '厦门', lat: 24.4798, lng: 118.0894, province: '福建省' },
  { name: '泉州', lat: 24.8741, lng: 118.6757, province: '福建省' },
  { name: '南平', lat: 26.6435, lng: 118.1789, province: '福建省' },
  { name: '南昌', lat: 28.6820, lng: 115.8579, province: '江西省' },
  { name: '九江', lat: 29.7050, lng: 116.0019, province: '江西省' },
  { name: '景德镇', lat: 29.2687, lng: 117.1784, province: '江西省' },
  { name: '济南', lat: 36.6512, lng: 117.1201, province: '山东省' },
  { name: '青岛', lat: 36.0671, lng: 120.3826, province: '山东省' },
  { name: '烟台', lat: 37.4638, lng: 121.4478, province: '山东省' },
  { name: '威海', lat: 37.5128, lng: 122.1200, province: '山东省' },
  { name: '日照', lat: 35.4164, lng: 119.5269, province: '山东省' },
  { name: '潍坊', lat: 36.7068, lng: 119.1620, province: '山东省' },
  { name: '临沂', lat: 35.1045, lng: 118.3564, province: '山东省' },
  { name: '淄博', lat: 36.8131, lng: 118.0548, province: '山东省' },
  { name: '泰安', lat: 36.2000, lng: 117.0880, province: '山东省' },
  { name: '东营', lat: 37.4336, lng: 118.6747, province: '山东省' },

  // 华中
  { name: '郑州', lat: 34.7472, lng: 113.6253, province: '河南省' },
  { name: '洛阳', lat: 34.6197, lng: 112.4540, province: '河南省' },
  { name: '开封', lat: 34.7972, lng: 114.3080, province: '河南省' },
  { name: '南阳', lat: 32.9906, lng: 112.5283, province: '河南省' },
  { name: '武汉', lat: 30.5928, lng: 114.3055, province: '湖北省' },
  { name: '宜昌', lat: 30.6918, lng: 111.2864, province: '湖北省' },
  { name: '十堰', lat: 32.6292, lng: 110.7980, province: '湖北省' },
  { name: '恩施', lat: 30.2720, lng: 109.4880, province: '湖北省' },
  { name: '长沙', lat: 28.2278, lng: 112.9388, province: '湖南省' },
  { name: '张家界', lat: 29.1170, lng: 110.4793, province: '湖南省' },
  { name: '岳阳', lat: 29.3563, lng: 113.1284, province: '湖南省' },
  { name: '常德', lat: 29.0316, lng: 111.6986, province: '湖南省' },

  // 华南
  { name: '广州', lat: 23.1291, lng: 113.2644, province: '广东省' },
  { name: '深圳', lat: 22.5431, lng: 114.0579, province: '广东省' },
  { name: '珠海', lat: 22.2710, lng: 113.5767, province: '广东省' },
  { name: '佛山', lat: 23.0218, lng: 113.1219, province: '广东省' },
  { name: '东莞', lat: 23.0207, lng: 113.7518, province: '广东省' },
  { name: '中山', lat: 22.5170, lng: 113.3927, province: '广东省' },
  { name: '惠州', lat: 23.1116, lng: 114.4162, province: '广东省' },
  { name: '汕头', lat: 23.3540, lng: 116.6818, province: '广东省' },
  { name: '湛江', lat: 21.2706, lng: 110.3594, province: '广东省' },
  { name: '韶关', lat: 24.8107, lng: 113.5975, province: '广东省' },
  { name: '清远', lat: 23.6817, lng: 113.0560, province: '广东省' },
  { name: '南宁', lat: 22.8170, lng: 108.3669, province: '广西壮族自治区' },
  { name: '桂林', lat: 25.2734, lng: 110.2907, province: '广西壮族自治区' },
  { name: '北海', lat: 21.4812, lng: 109.1198, province: '广西壮族自治区' },
  { name: '柳州', lat: 24.3264, lng: 109.4156, province: '广西壮族自治区' },
  { name: '海口', lat: 20.0440, lng: 110.1990, province: '海南省' },
  { name: '三亚', lat: 18.2528, lng: 109.5119, province: '海南省' },
  { name: '儋州', lat: 19.5211, lng: 109.5769, province: '海南省' },

  // 西南
  { name: '成都', lat: 30.5728, lng: 104.0668, province: '四川省' },
  { name: '绵阳', lat: 31.4677, lng: 104.6796, province: '四川省' },
  { name: '乐山', lat: 29.5522, lng: 103.7660, province: '四川省' },
  { name: '宜宾', lat: 28.7513, lng: 104.6234, province: '四川省' },
  { name: '西昌', lat: 27.8945, lng: 102.2645, province: '四川省' },
  { name: '阿坝', lat: 31.8990, lng: 102.2214, province: '四川省' },
  { name: '甘孜', lat: 30.0486, lng: 101.9625, province: '四川省' },
  { name: '贵阳', lat: 26.6470, lng: 106.6302, province: '贵州省' },
  { name: '遵义', lat: 27.7256, lng: 106.9273, province: '贵州省' },
  { name: '昆明', lat: 25.0389, lng: 102.7183, province: '云南省' },
  { name: '大理', lat: 25.6065, lng: 100.2679, province: '云南省' },
  { name: '丽江', lat: 26.8721, lng: 100.2272, province: '云南省' },
  { name: '西双版纳', lat: 22.0074, lng: 100.7971, province: '云南省' },
  { name: '拉萨', lat: 29.6500, lng: 91.1409, province: '西藏自治区' },
  { name: '林芝', lat: 29.6485, lng: 94.3624, province: '西藏自治区' },

  // 西北
  { name: '西安', lat: 34.3416, lng: 108.9398, province: '陕西省' },
  { name: '宝鸡', lat: 34.3736, lng: 107.2384, province: '陕西省' },
  { name: '汉中', lat: 33.0674, lng: 107.0238, province: '陕西省' },
  { name: '延安', lat: 36.5853, lng: 109.4898, province: '陕西省' },
  { name: '兰州', lat: 36.0611, lng: 103.8343, province: '甘肃省' },
  { name: '天水', lat: 34.5810, lng: 105.7249, province: '甘肃省' },
  { name: '张掖', lat: 38.9262, lng: 100.4495, province: '甘肃省' },
  { name: '酒泉', lat: 39.7321, lng: 98.4941, province: '甘肃省' },
  { name: '西宁', lat: 36.6232, lng: 101.7782, province: '青海省' },
  { name: '海西', lat: 37.3737, lng: 97.3708, province: '青海省' },
  { name: '银川', lat: 38.4872, lng: 106.2309, province: '宁夏回族自治区' },
  { name: '中卫', lat: 37.5149, lng: 105.1966, province: '宁夏回族自治区' },
  { name: '乌鲁木齐', lat: 43.8256, lng: 87.6168, province: '新疆维吾尔自治区' },
  { name: '伊犁', lat: 43.9191, lng: 81.3243, province: '新疆维吾尔自治区' },
  { name: '喀什', lat: 39.4704, lng: 75.9898, province: '新疆维吾尔自治区' },
  { name: '阿勒泰', lat: 47.8484, lng: 88.1396, province: '新疆维吾尔自治区' },
  { name: '吐鲁番', lat: 42.9513, lng: 89.1895, province: '新疆维吾尔自治区' },
];

Page({
  data: {
    statusBarHeight: 20,
    searchKey: '',
    filteredCities: [],
    groupedCities: [],
    hotCities: []
  },

  onLoad() {
    const sys = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {};
    this.setData({ statusBarHeight: sys.statusBarHeight || 20 });

    // 构建热门城市列表（含坐标）
    const hotNames = ['北京', '上海', '广州', '深圳', '成都', '杭州', '武汉', '西安', '青岛', '三亚', '昆明', '拉萨'];
    const hotCities = hotNames.map(n => {
      const c = CITY_LIST.find(c => c.name === n);
      return c ? { name: c.name, lat: c.lat, lng: c.lng } : null;
    }).filter(Boolean);
    this.setData({ hotCities });

    this.buildGrouped();
  },

  // 按省份分组
  buildGrouped() {
    const groups = {};
    const order = [];
    for (const c of CITY_LIST) {
      if (!groups[c.province]) {
        groups[c.province] = [];
        order.push(c.province);
      }
      groups[c.province].push(c);
    }
    const grouped = order.map(p => ({ province: p, cities: groups[p] }));
    this.setData({ groupedCities: grouped, filteredCities: [] });
  },

  // 搜索
  onSearchInput(e) {
    const key = (e.detail.value || '').trim();
    this.setData({ searchKey: key });
    if (!key) {
      this.buildGrouped();
      return;
    }
    const filtered = CITY_LIST.filter(c =>
      c.name.indexOf(key) >= 0 || c.province.indexOf(key) >= 0
    );
    this.setData({ filteredCities: filtered, groupedCities: [] });
  },

  // 清空搜索
  clearSearch() {
    this.setData({ searchKey: '' });
    this.buildGrouped();
  },

  // 选择城市
  selectCity(e) {
    const { name, lat, lng } = e.currentTarget.dataset;
    const app = getApp();
    app.globalData.cityCenter = { latitude: lat, longitude: lng };
    app.globalData.cityName = name;
    app.globalData.cityChanged = true;
    wx.navigateBack();
  },

  // 使用当前位置
  useLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const app = getApp();
        app.globalData.cityCenter = {
          latitude: res.latitude,
          longitude: res.longitude
        };
        app.globalData.cityName = '当前位置';
        app.globalData.cityChanged = true;
        wx.navigateBack();
      },
      fail: () => {
        wx.showToast({ title: '定位失败', icon: 'none' });
      }
    });
  },

  goBack() {
    wx.navigateBack();
  }
});
