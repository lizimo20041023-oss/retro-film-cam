/**
 * 底部三颗参数胶囊的「无操作自动隐藏」。
 *
 * 用户规格（v1.8.0 · 模块三）：默认显示；**无操作 3000ms 后淡出并轻微下移**；
 * 拖动参数 / 展开焦距档位期间**常亮且锁死**（不许操作到一半自己溜走）；
 * 轻触取景器对焦时立即唤醒并重新计时；隐藏状态下**不许吃掉**那一下对焦点击。
 *
 * ── 为什么抽成 hook + 一个纯状态机 ────────────────────────────────────────
 * ① 「什么时候该隐藏」是一道纯时序题：到点、重置、锁、卸载清表。把它和手势/渲染
 *    揉在一个组件里，就只能靠真机反复点三秒去验。这里把判定收进
 *    `CapsuleAutoHideMachine`（**计时器从外部注入**），探针就能用假计时器把
 *    2999 / 3000 / 3001 这种边界一次跑完，还能验"锁期间到点不隐藏""引用计数只
 *    松一路仍不隐藏""卸载后计时器为零"这些在真机上几乎测不出来的路径
 *    （见工作区根的 `_probe_capsule_autohide.cjs`）。
 * ② 视觉层（`ViewfinderBar`）与手势层（`ParameterScrubBar`）都要用它，放在任何
 *    一边都会让另一边反向 import —— 上一轮的 require 环就是这么来的（见
 *    `ParameterScrubBar.tsx` 文件头）。hooks 是两边都依赖的下层，放这里没有环。
 * ③ 状态机**只认"可见/隐藏"这一个布尔量**，动画是它的下游（`sink.animate`）：
 *    这样"隐藏"这件事在**标志翻转的那一帧**就成立了，`pointerEvents` 与
 *    `accessibilityElementsHidden` 跟着立刻生效，不必等 220ms 的淡出动画跑完 ——
 *    否则动画那段时间里胶囊已经看不见、却还在吃点击。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * 无操作多久后隐藏：3000ms 是用户给的数。它同时是"看一眼画面"和"我还在调"之间的
 * 分界 —— 比这个短，用户抬眼看构图时胶囊就没了；比这个长，它会在用户已经想拍照时
 * 还挂在画面下方。
 */
export const CAPSULE_HIDE_TIMEOUT_MS = 3000;

/**
 * 隐藏时整体下移多少：24pt。
 *
 * 用户的原话是"轻微下移"，所以这里要的是"看得出它退场了"，而不是"它被搬到别处"。
 * 胶囊连外壳高 30pt（`ViewfinderBar` 的 `CAPSULE_HEIGHT`），下移 24 = 高度的 0.8 倍：
 * 位移明确压过"抖动"的量级，又小于一个自身高度，不会把胶囊推进控制台里。
 */
export const CAPSULE_HIDE_OFFSET_PX = 24;

/**
 * 淡出 220ms / 淡入 160ms。
 *
 * 两个方向刻意不对称：淡入是**对用户操作的应答**，慢了会让人以为"没反应"（160ms
 * 与胶囊展开态自己的 160ms 同一档手感）；淡出是**它自己退场**，慢一点才不显突兀
 * （比淡入多 60ms，接近 iOS 默认的退场节奏）。
 */
const CAPSULE_FADE_OUT_MS = 220;
const CAPSULE_FADE_IN_MS = 160;

/** 计时器句柄：`setTimeout` 在 RN/Node 下类型不同，用它的返回值类型即可。 */
export type CapsuleHideTimerHandle = ReturnType<typeof setTimeout>;

/** 注入式计时器：真机走 `setTimeout`，探针走假时钟。 */
export interface CapsuleHideTimers {
  set(callback: () => void, delayMs: number): CapsuleHideTimerHandle;
  clear(handle: CapsuleHideTimerHandle): void;
}

/** 为什么隐藏（或被唤醒）—— 只为让探针能断言"是谁触发的"，逻辑上一律等价。 */
export type CapsuleHideReason = 'wake' | 'lock' | 'timeout' | 'dispose';

/** 状态机的下游：一个改 React 状态，一个跑动画。 */
export interface CapsuleHideSink {
  /** 可见性翻转的**同步**回调（在 `hidden` 这个标志已经改好之后才调）。 */
  onHiddenChange(hidden: boolean, reason: CapsuleHideReason): void;
  /** 视觉动画：把 opacity / translateY 送到 `hidden` 对应的目标。 */
  animate(hidden: boolean): void;
}

/**
 * 状态机本身。它**不认识 React，也不认识 `Animated`** —— 这两个世界都从构造函数注进来，
 * 所以探针可以完全同步地驱动它（见文件头 ①）。
 *
 * 三条不变量（探针逐条断言）：
 *   · `lock()` 计数 > 0 时**绝不**隐藏，且期间到点的表是**取消**而不是排队等解锁；
 *   · 任何一次 `wake()` 都清掉旧表再起一张新的（所以连续 wake 永远只有一张表在跑）；
 *   · `dispose()` 之后一张表都不剩，且后续 wake/lock/unlock 全部无效。
 */
export class CapsuleAutoHideMachine {
  /** 公开只读：hook 靠它判断"超时时间变了要换一台状态机"。 */
  readonly timeoutMs: number;
  private readonly timers: CapsuleHideTimers;
  private readonly sink: CapsuleHideSink;
  private hiddenFlag = false;
  private lockCount = 0;
  private externalLocked = false;
  private timer: CapsuleHideTimerHandle | null = null;
  private disposedFlag = false;

  constructor(input: { timeoutMs: number; timers: CapsuleHideTimers; sink: CapsuleHideSink }) {
    this.timeoutMs = input.timeoutMs;
    this.timers = input.timers;
    this.sink = input.sink;
  }

  get hidden(): boolean {
    return this.hiddenFlag;
  }

  /** 引用计数（拖动可能有多路同时按住，例如"拖动中"与"档位条展开中"）。 */
  get locks(): number {
    return this.lockCount;
  }

  /** 当前有没有一张在跑的表（探针断言"不堆积""卸载清零"就看它）。 */
  get armed(): boolean {
    return this.timer !== null;
  }

  get locked(): boolean {
    return this.lockCount > 0 || this.externalLocked;
  }

  get disposed(): boolean {
    return this.disposedFlag;
  }

  /**
   * 挂载时调一次：从"可见"开始起表。
   *
   * 为什么不在构造函数里起表：状态机是在渲染期间建的，而 React 可能丢弃一次渲染
   * （并发渲染）。丢弃的那次如果已经起了表，就会留下一张没人清的定时器 —— 起表
   * 放挂载 effect 里，丢弃的渲染连表都没有，天然没有泄漏。
   */
  start(): void {
    this.arm();
  }

  /** 唤醒：立刻回到可见（含打断进行中的淡出）+ 重新起一张 3000ms 的表。 */
  wake(): void {
    if (this.disposedFlag) {
      return;
    }
    this.clearTimer();
    this.show('wake');
    this.arm();
  }

  /**
   * 加锁：引用计数 +1，**取消**到点的表（不是排队 —— 用户从没要求"锁完了补一次隐藏"），
   * 并且把胶囊拉回可见状态：锁的语义是"这段时间里它必须一直亮着"，如果它已经是隐藏的
   * （例如无障碍动作在隐藏态触发了展开），那也得先亮起来再谈锁。
   */
  lock(): void {
    if (this.disposedFlag) {
      return;
    }
    this.lockCount += 1;
    this.clearTimer();
    this.show('lock');
  }

  /**
   * 解锁：计数 -1（**下限钳在 0**，防"多松一次"把计数打负、后面再也锁不住）；
   * 全部解锁后才重新起表 —— 而且是**从解锁这一刻**重新起 3000ms，不是接着旧表的剩余时间。
   */
  unlock(): void {
    if (this.disposedFlag) {
      return;
    }
    if (this.lockCount > 0) {
      this.lockCount -= 1;
    }
    if (!this.locked) {
      this.arm();
    }
  }

  /**
   * 声明式锁（父级一句 `locked={active !== null}` 用得上）：与 `lock()/unlock()` 的
   * 计数是**两路独立的锁**，谁在场都算锁住。它不参与计数，所以父级重渲染多少次都不会
   * 把计数弄乱。
   */
  setExternalLock(locked: boolean): void {
    if (this.disposedFlag || locked === this.externalLocked) {
      return;
    }
    this.externalLocked = locked;
    if (locked) {
      this.clearTimer();
      this.show('lock');
      return;
    }
    if (!this.locked) {
      this.arm();
    }
  }

  /** 卸载：清表 + 之后一切操作失效。 */
  dispose(): void {
    this.disposedFlag = true;
    this.clearTimer();
  }

  private arm(): void {
    if (this.disposedFlag || this.locked) {
      return;
    }
    this.clearTimer();
    this.timer = this.timers.set(() => {
      // 先把句柄置空再隐藏：隐藏回调里如果同步再调 wake()，不该被当成"旧表还在"。
      this.timer = null;
      this.hide('timeout');
    }, this.timeoutMs);
  }

  private clearTimer(): void {
    if (this.timer === null) {
      return;
    }
    this.timers.clear(this.timer);
    this.timer = null;
  }

  private show(reason: CapsuleHideReason): void {
    if (!this.hiddenFlag) {
      return;
    }
    // 先翻标志再通知：下游（React 状态 / 命中测试）读到的必须是**新的**值，
    // 这样"标志翻转"与"pointerEvents 变化"发生在同一帧，而不是动画之后。
    this.hiddenFlag = false;
    this.sink.onHiddenChange(false, reason);
    this.sink.animate(false);
  }

  private hide(reason: CapsuleHideReason): void {
    if (this.disposedFlag || this.hiddenFlag || this.locked) {
      return;
    }
    this.hiddenFlag = true;
    this.sink.onHiddenChange(true, reason);
    this.sink.animate(true);
  }
}

/**
 * `hidden` → `pointerEvents`。
 *
 * 单独抽成纯函数是为了让"隐藏当帧就不再吃触摸"这条**可被断言**：探针在
 * `onHiddenChange(true, …)` 的回调里直接调它，必须立刻拿到 `'none'`。
 */
export function pointerEventsFor(hidden: boolean): 'auto' | 'none' {
  return hidden ? 'none' : 'auto';
}

/** 真机计时器。 */
const REAL_TIMERS: CapsuleHideTimers = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => {
    clearTimeout(handle);
  },
};

export interface CapsuleAutoHideOptions {
  /** 无操作多久后隐藏，默认 `CAPSULE_HIDE_TIMEOUT_MS`。 */
  timeoutMs?: number;
  /**
   * 声明式锁：为 true 时**绝不**隐藏（展开态常亮就是这么接的）。
   * 它与 `lock()/unlock()` 的计数是两路独立的锁。
   */
  locked?: boolean;
  /** 隐藏时下移多少，默认 `CAPSULE_HIDE_OFFSET_PX`。 */
  hiddenOffsetPx?: number;
}

export interface CapsuleAutoHide {
  /** 可见度：1 可见、0 隐藏（`useNativeDriver: true`，所以只能挂在不透明/变换上）。 */
  opacity: Animated.Value;
  /** 下移量：0 原位、`hiddenOffsetPx` 隐藏位。 */
  translateY: Animated.Value;
  /** 已隐藏（React 状态，供渲染判断无障碍属性等）。 */
  hidden: boolean;
  /** 同一份隐藏标志的 ref 版本：给"不进渲染也要立刻读到"的地方用（手势层）。 */
  hiddenRef: MutableRefObject<boolean>;
  /** 直接喂给容器的 `pointerEvents`：隐藏即 `'none'`，绝不吃掉取景器的对焦点击。 */
  pointerEvents: 'auto' | 'none';
  /** 唤醒：立刻可见 + 重新计时（轻触对焦、任何参数变化都走它）。 */
  wake: () => void;
  /** 加锁：引用计数 +1，锁住期间不会隐藏。 */
  lock: () => void;
  /** 解锁：计数 -1，全部解锁后从这一刻重新计时。 */
  unlock: () => void;
}

/**
 * 把状态机接到 React + `Animated` 上。
 *
 * 用法（`ParameterScrubBar` 的实际接法）：
 *   `const { opacity, translateY, pointerEvents, wake, lock, unlock } = useCapsuleAutoHide({ locked: active !== null });`
 *   —— 手势按下 `lock()`、抬手 `unlock() + wake()`、参数一变 `wake()`、
 *   `active !== null`（展开态）由 `locked` 保证常亮。
 */
export function useCapsuleAutoHide(options: CapsuleAutoHideOptions = {}): CapsuleAutoHide {
  const timeoutMs = options.timeoutMs ?? CAPSULE_HIDE_TIMEOUT_MS;
  const hiddenOffsetPx = options.hiddenOffsetPx ?? CAPSULE_HIDE_OFFSET_PX;
  const externalLocked = options.locked === true;

  // 两个 `Animated.Value` 建一次就永不重建：重建会让正在跑的动画失去目标值。
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);

  const animate = useCallback(
    (nextHidden: boolean) => {
      const duration = nextHidden ? CAPSULE_FADE_OUT_MS : CAPSULE_FADE_IN_MS;
      // 退场用 `Easing.in`（慢慢起步再甩出去，像被推下去），入场用 `Easing.out`
      // （一上来就动，最后轻轻落位）—— 两个方向的手感不同，曲线也不该一样。
      const easing = nextHidden ? Easing.in(Easing.quad) : Easing.out(Easing.quad);
      Animated.parallel([
        Animated.timing(opacity, { toValue: nextHidden ? 0 : 1, duration, easing, useNativeDriver: true }),
        Animated.timing(translateY, {
          toValue: nextHidden ? hiddenOffsetPx : 0,
          duration,
          easing,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [hiddenOffsetPx, opacity, translateY],
  );

  const onHiddenChange = useCallback((nextHidden: boolean) => {
    // ref 先写：`pointerEvents` 与无障碍属性走 React 状态（下一帧生效），
    // 而手势层这种"不进渲染也要立刻读到"的地方读 ref，两者不能有先后歧义。
    hiddenRef.current = nextHidden;
    setHidden(nextHidden);
  }, []);

  /**
   * sink 用 ref 包一层：状态机持有的是这层**稳定的壳**，而每次渲染都把最新的
   * `animate` / `onHiddenChange` 换进去 —— 这样状态机不需要在每次 props 变化时重建
   * （重建就会把在跑的定时器一起丢掉）。
   */
  const sink = useRef<CapsuleHideSink>({ onHiddenChange, animate });
  sink.current = { onHiddenChange, animate };

  const machineRef = useRef<CapsuleAutoHideMachine | null>(null);
  if (machineRef.current === null || machineRef.current.timeoutMs !== timeoutMs) {
    // 超时时间变了等于换一套规则：把旧机连表一起收掉再建新的（本 App 里它是常量，
    // 这条分支只为"将来有人把它做成可配置"时不留下野表）。
    machineRef.current?.dispose();
    machineRef.current = new CapsuleAutoHideMachine({
      timeoutMs,
      timers: REAL_TIMERS,
      sink: {
        onHiddenChange: (nextHidden, reason) => {
          sink.current.onHiddenChange(nextHidden, reason);
        },
        animate: (nextHidden) => {
          sink.current.animate(nextHidden);
        },
      },
    });
  }
  const machine = machineRef.current;

  useEffect(() => {
    machine.start();
    return () => {
      // 卸载必须清表：表里会 setState，组件没了就是泄漏 + 警告。
      machine.dispose();
    };
  }, [machine]);

  useEffect(() => {
    machine.setExternalLock(externalLocked);
  }, [externalLocked, machine]);

  const wake = useCallback(() => {
    machine.wake();
  }, [machine]);
  const lock = useCallback(() => {
    machine.lock();
  }, [machine]);
  const unlock = useCallback(() => {
    machine.unlock();
  }, [machine]);

  return {
    opacity,
    translateY,
    hidden,
    hiddenRef,
    pointerEvents: pointerEventsFor(hidden),
    wake,
    lock,
    unlock,
  };
}
