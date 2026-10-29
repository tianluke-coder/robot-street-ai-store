// src/human.js
// 线下人类顾客：沿街区行走、进入实体门店、观察体验、与店员交流、记录线下体验。
// 注意：人类顾客是“真实的人”，不使用数字分身的线上机制，也不展示 JSON 报文。
// 其模拟耗时以“分钟”计，与线上小星的“秒”严格区分。

import { getProductById, getProductsByStore } from '../data/products.js';
import { getPlaceById } from '../data/street.js';

export const HUMAN_STATES = {
  IDLE: 'IDLE',
  WALKING: 'WALKING',
  ENTERING: 'ENTERING',
  OBSERVING: 'OBSERVING',
  CONSULTING: 'CONSULTING',
  RECORDING: 'RECORDING',
  RETURNING: 'RETURNING',
  REPORTING: 'REPORTING',
};

export const HUMAN_STATE_LABELS = {
  IDLE: '待出发',
  WALKING: '沿街步行',
  ENTERING: '进入门店',
  OBSERVING: '观察体验',
  CONSULTING: '咨询店员',
  RECORDING: '记录体验',
  RETURNING: '返回入口',
  REPORTING: '提交报告',
};

export class HumanCustomer {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = HUMAN_STATES.IDLE;
    this.minutes = 0; // 线下模拟用时（分钟）
    this.currentPlace = null;
    this.observations = []; // 线下体验记录
    this.experiment = null;
  }

  setExperiment(exp) {
    this.experiment = exp;
    this.observations = [];
  }

  setState(s) {
    this.state = s;
  }

  // 累加线下模拟用时（分钟），与动画真实时长解耦
  addMinutes(n) {
    this.minutes += n;
  }

  // 进入某实体点位并记录线下体验（面向人的信息，与线上规格分开保存）
  observePlace(placeId) {
    const place = getPlaceById(placeId);
    if (!place) return null;

    const obs = {
      placeId,
      placeName: place.name,
      services: place.humanServices.slice(),
      physicalNotes: [],
      newlyFound: false,
    };

    // 若点位关联线上商店，把该店商品的“实物体验”作为线下观察的一部分单独记录
    if (place.onlineStoreId && place.onlineStoreId !== '__theater__') {
      const products = getProductsByStore(place.onlineStoreId);
      obs.physicalNotes = products
        .filter((p) => p.physical)
        .map((p) => `${p.name}：${p.physical.note}（操作${p.physical.handsOn}）`);
    } else if (place.onlineStoreId === '__theater__') {
      obs.physicalNotes = ['现场发现剧目与活动（线下新发现，尚未录入线上目录）'];
      obs.newlyFound = true;
    }
    obs.humanNote = place.humanServices[0] || '';
    this.observations.push(obs);
    this.currentPlace = placeId;
    return obs;
  }

  // 生成线下体验报告（供主人决策界面左侧展示）
  buildReport() {
    return this.observations.map((o) => ({
      place: o.placeName,
      services: o.services,
      notes: o.physicalNotes,
      newlyFound: o.newlyFound,
    }));
  }
}
