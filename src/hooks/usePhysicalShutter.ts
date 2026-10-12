import { useEffect, useMemo, useRef } from 'react';

import PhysicalShutter, {
  PHYSICAL_SHUTTER_EVENT,
  type PhysicalShutterPhase,
} from '../../modules/physical-shutter';

/**
 * 物理快门键：iPhone 16 的 Camera Control 电容键，以及所有机型的音量上/下键。
 *
 * 设计要点与理由：
 * - 原生层只负责「把每一次按下如实报上来」，不判断快门是否正忙。是否忽略这次
 *   按下属于调用方的状态机，和 usePinchZoom 只报手势、不决定缩放策略是同一个
 *   分工。
 * - 订阅只在挂载 / enabled 翻转时建立一次，所以每次渲染都把回调和触发相位镜像
 *   进 ref；否则监听器会一直调用第一次渲染时那个 onPress。
 * - iOS 17.2 以下没有任何公开 API 能拿到这些按键（Apple 只在 17.2 才引入
 *   AVCaptureEventInteraction，再往前的做法全是私有 API）。那种设备上原生模块
 *   要么是 null、要么 isSupported 为 false，此时整个 hook 是纯粹的空操作，
 *   绝不抛错。
 * - 不区分按键来源：AVCaptureEvent 只暴露 phase / shouldPlaySound / play(_:)，
 *   没有按键身份信息，所以事件里没有 source 字段。
 */

/** Apple 把「松手」(`ended`) 记为拍摄时机，所以默认等松手再触发。 */
const DEFAULT_TRIGGER_PHASE: PhysicalShutterPhase = 'ended';

export type PhysicalShutterOptions = {
  /**
   * 为 false 时原生监听会被摘掉，硬件按键立刻恢复系统默认行为（调音量）。
   * 相机页面不在前台、或正在拍摄时把它设成 false 即可。
   */
  enabled: boolean;
  /** 每一次物理按下调用一次；调用方自己决定要不要真的拍照。 */
  onPress: () => void;
  /** 按下的哪个阶段触发 onPress。默认 `'ended'`（松手）。 */
  triggerPhase?: PhysicalShutterPhase;
};

export type PhysicalShutterStatus = {
  /** 当前系统是否存在可用的公开 API（iOS 17.2 及以上才为 true）。 */
  supported: boolean;
  /** 此刻是否真的挂上了原生监听。 */
  active: boolean;
};

export function usePhysicalShutter({
  enabled,
  onPress,
  triggerPhase = DEFAULT_TRIGGER_PHASE,
}: PhysicalShutterOptions): PhysicalShutterStatus {
  // 订阅只建立一次，所以每次渲染都把会变的值镜像进 ref（同 usePinchZoom.ts）。
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  const triggerPhaseRef = useRef(triggerPhase);
  triggerPhaseRef.current = triggerPhase;

  // 模块对象和系统版本在进程生命周期内都不会变，所以每帧重算这个布尔量是安全的：
  // 它是值类型，useEffect 的依赖比较用的是 Object.is，不会造成重复订阅。
  const supported =
    PhysicalShutter !== null &&
    PhysicalShutter.isSupported === true &&
    typeof PhysicalShutter.addListener === 'function';

  useEffect(() => {
    const native = PhysicalShutter;
    if (!enabled || !supported || native === null) {
      return;
    }

    // timestamp 是单调递增的 systemUptime，所以「见过的值」只可能是同一次按下的
    // 重复投递；丢掉它就是「一次按下只开一枪」的保证。
    let lastTimestamp = 0;
    let alive = true;

    const subscription = native.addListener(PHYSICAL_SHUTTER_EVENT, (event) => {
      if (!alive || event.phase !== triggerPhaseRef.current) {
        return;
      }
      if (event.timestamp <= lastTimestamp) {
        return;
      }
      lastTimestamp = event.timestamp;
      onPressRef.current();
    });

    return () => {
      alive = false;
      subscription.remove();
    };
  }, [enabled, supported]);

  return useMemo(
    () => ({ supported, active: enabled && supported }),
    [enabled, supported]
  );
}
