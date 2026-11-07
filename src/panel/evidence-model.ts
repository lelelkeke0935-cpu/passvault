import type {Verify} from './types';
import {validCount} from './stage-model.ts';

export function verificationText(value: Verify): {text: string; damaged: boolean} {
  if (value.ok === false) {
    return {text: validCount(value.brokenAt) && value.brokenAt > 0
      ? `第 ${value.brokenAt} 筆紀錄被改過` : '紀錄驗證未通過', damaged: true};
  }
  if (value.ok !== true || !validCount(value.count) || !/^[a-f\d]{6,12}$/i.test(value.head)) {
    return {text:'紀錄驗證暫時無法讀取', damaged:false};
  }
  return {text:`紀錄完整：${value.count} 筆，指紋 ${value.head.slice(0,6)}`, damaged:false};
}
