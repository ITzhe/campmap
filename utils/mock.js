// mock.js — 降级 Mock 营地数据

const MOCK_CAMPS = [
  {
    spot_code: 'QD001', name: '崂山风景区露营基地', longitude: 120.6240, latitude: 36.1571,
    parking_status: 1, toilet_status: 1, water_status: 1, power_status: 1, charging_status: 1,
    rv_friendly: 1, trailer_friendly: 1, tent_friendly: 1, shower_status: 1, fishing_status: 0,
    cooking_status: 1, fire_status: 0, repair_status: 0, grocery_status: 1, dining_status: 1,
    accommodation_status: 1, address: '青岛市崂山区崂山风景区松林路',
    intro: '位于崂山风景区内，依山傍海，环境优美，空气清新，是青岛周边最受欢迎的露营地之一。配备完善的房车营位和帐篷区，可同时欣赏山海美景，适合家庭及团体露营。',
    memo: '周末及节假日需提前预约，旺季人流较多，建议工作日前往。'
  },
  {
    spot_code: 'QD002', name: '石老人海水浴场营地', longitude: 120.4819, latitude: 36.0722,
    parking_status: 0, toilet_status: 1, water_status: 1, power_status: 0, charging_status: 0,
    rv_friendly: 0, trailer_friendly: 0, tent_friendly: 1, shower_status: 1, fishing_status: 1,
    cooking_status: 0, fire_status: 0, repair_status: 0, grocery_status: 0, dining_status: 1,
    accommodation_status: 0, address: '青岛市崂山区海口路与海尔路交汇',
    intro: '紧邻石老人海水浴场，可听海入眠。沙滩平坦适合搭帐篷，周边餐饮配套齐全，是夏日海滨露营的绝佳选择。',
    memo: '夜间涨潮请注意安全距离，禁止在沙滩明火。'
  },
  {
    spot_code: 'QD003', name: '黄岛金沙滩房车营地', longitude: 120.1669, latitude: 35.9647,
    parking_status: 1, toilet_status: 1, water_status: 1, power_status: 1, charging_status: 1,
    rv_friendly: 1, trailer_friendly: 1, tent_friendly: 1, shower_status: 1, fishing_status: 1,
    cooking_status: 1, fire_status: 1, repair_status: 1, grocery_status: 1, dining_status: 1,
    accommodation_status: 1, address: '青岛市黄岛区金沙滩路88号',
    intro: '青岛最大的房车专属营地，设施齐全。提供标准房车营位、水电接驳、排污设施，配套超市、餐厅与维修站，是房车旅行者的理想驿站。',
    memo: '房车营位需提前48小时预约，旺季价格上浮20%。'
  },
  {
    spot_code: 'QD004', name: '即墨鳌山湾滨海营地', longitude: 120.7122, latitude: 36.3814,
    parking_status: 0, toilet_status: 1, water_status: 1, power_status: 0, charging_status: 0,
    rv_friendly: 1, trailer_friendly: 0, tent_friendly: 1, shower_status: 0, fishing_status: 1,
    cooking_status: 1, fire_status: 1, repair_status: 0, grocery_status: 0, dining_status: 0,
    accommodation_status: 0, address: '青岛市即墨区鳌山卫镇滨海大道',
    intro: '原生态滨海营地，远离城市喧嚣，星空璀璨。可赶海、海钓、篝火烧烤，适合追求野趣的露营爱好者。',
    memo: '周边无商店，请自备物资；注意防风。'
  },
  {
    spot_code: 'QD005', name: '胶州湾大桥观景营地', longitude: 120.3090, latitude: 36.1702,
    parking_status: 1, toilet_status: 1, water_status: 0, power_status: 0, charging_status: 0,
    rv_friendly: 1, trailer_friendly: 1, tent_friendly: 0, shower_status: 0, fishing_status: 1,
    cooking_status: 0, fire_status: 0, repair_status: 0, grocery_status: 0, dining_status: 0,
    accommodation_status: 0, address: '青岛市城阳区胶州湾大桥北侧',
    intro: '位于胶州湾大桥北侧高地，视野开阔，可俯瞰跨海大桥全景与日落。适合房车及拖挂停靠观景，是摄影爱好者打卡圣地。',
    memo: '风大请注意固定，夜间无照明请备好手电。'
  },
  {
    spot_code: 'QD006', name: '崂山北九水森林营地', longitude: 120.5910, latitude: 36.2330,
    parking_status: 0, toilet_status: 1, water_status: 1, power_status: 0, charging_status: 0,
    rv_friendly: 0, trailer_friendly: 0, tent_friendly: 1, shower_status: 0, fishing_status: 0,
    cooking_status: 1, fire_status: 0, repair_status: 0, grocery_status: 1, dining_status: 1,
    accommodation_status: 0, address: '青岛市崂山区北九水风景区旁',
    intro: '隐于崂山北九水山谷之中，溪流潺潺，林木茂密，夏季清凉宜人。适合帐篷露营与森林徒步，是避暑纳凉的好去处。',
    memo: '雨季溪水上涨，请勿在河道旁扎营。'
  }
];

module.exports = { MOCK_CAMPS };
