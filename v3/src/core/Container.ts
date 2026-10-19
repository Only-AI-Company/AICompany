/**
 * AI Company v3 - Dependency Injection Container
 *
 * 统一管理所有单例实例
 *
 * 职责：
 * - 集中管理所有单例组件
 * - 提供统一的依赖注入
 * - 支持优雅的重置和清理
 * - 确保组件初始化顺序
 */

type Factory<T> = () => T;
type Destructor<T> = (instance: T) => void | Promise<void>;

interface Registration<T> {
  factory: Factory<T>;
  destructor?: Destructor<T>;
  instance?: T;
  initialized: boolean;
}

export class DIContainer {
  private static instance: DIContainer | null = null;
  private registrations = new Map<string, Registration<any>>();
  private initOrder: string[] = [];

  private constructor() {}

  /**
   * 获取容器单例
   */
  static getInstance(): DIContainer {
    if (!DIContainer.instance) {
      DIContainer.instance = new DIContainer();
    }
    return DIContainer.instance;
  }

  /**
   * 注册组件
   *
   * @param key 组件唯一标识
   * @param factory 组件工厂函数
   * @param destructor 可选的清理函数
   */
  register<T>(key: string, factory: Factory<T>, destructor?: Destructor<T>): void {
    if (this.registrations.has(key)) {
      console.warn(`[DIContainer] Component "${key}" already registered, overwriting`);
    }

    this.registrations.set(key, {
      factory,
      destructor,
      initialized: false,
    });

    console.log(`[DIContainer] Registered component: ${key}`);
  }

  /**
   * 获取组件实例
   *
   * 如果实例不存在，会调用工厂函数创建
   *
   * @param key 组件唯一标识
   * @returns 组件实例
   * @throws 如果组件未注册
   */
  get<T>(key: string): T {
    const registration = this.registrations.get(key);

    if (!registration) {
      throw new Error(`Component "${key}" not registered in DI container`);
    }

    // 如果实例已存在，直接返回
    if (registration.initialized && registration.instance !== undefined) {
      return registration.instance as T;
    }

    // 创建新实例
    console.log(`[DIContainer] Initializing component: ${key}`);
    const instance = registration.factory();

    registration.instance = instance;
    registration.initialized = true;

    // 记录初始化顺序
    if (!this.initOrder.includes(key)) {
      this.initOrder.push(key);
    }

    return instance as T;
  }

  /**
   * 检查组件是否已注册
   */
  has(key: string): boolean {
    return this.registrations.has(key);
  }

  /**
   * 检查组件是否已初始化
   */
  isInitialized(key: string): boolean {
    const registration = this.registrations.get(key);
    return registration?.initialized ?? false;
  }

  /**
   * 重置单个组件
   *
   * @param key 组件唯一标识
   */
  async reset(key: string): Promise<void> {
    const registration = this.registrations.get(key);

    if (!registration) {
      console.warn(`[DIContainer] Cannot reset unregistered component: ${key}`);
      return;
    }

    if (!registration.initialized) {
      return; // 未初始化，无需重置
    }

    // 调用析构函数
    if (registration.destructor && registration.instance) {
      try {
        await registration.destructor(registration.instance);
        console.log(`[DIContainer] Destroyed component: ${key}`);
      } catch (error: any) {
        console.error(`[DIContainer] Error destroying component "${key}":`, error.message);
      }
    }

    // 重置状态
    registration.instance = undefined;
    registration.initialized = false;

    console.log(`[DIContainer] Reset component: ${key}`);
  }

  /**
   * 重置所有组件
   *
   * 按照初始化的逆序进行清理
   */
  async resetAll(): Promise<void> {
    console.log('[DIContainer] Resetting all components...');

    // 按初始化的逆序清理
    const reversedOrder = [...this.initOrder].reverse();

    for (const key of reversedOrder) {
      await this.reset(key);
    }

    this.initOrder = [];
    console.log('[DIContainer] All components reset');
  }

  /**
   * 获取所有已注册的组件键
   */
  getRegisteredKeys(): string[] {
    return Array.from(this.registrations.keys());
  }

  /**
   * 获取初始化顺序
   */
  getInitOrder(): string[] {
    return [...this.initOrder];
  }

  /**
   * 获取组件状态信息（用于调试）
   */
  getStatus(): Record<string, { initialized: boolean; hasInstance: boolean }> {
    const status: Record<string, { initialized: boolean; hasInstance: boolean }> = {};

    for (const [key, registration] of this.registrations) {
      status[key] = {
        initialized: registration.initialized,
        hasInstance: registration.instance !== undefined,
      };
    }

    return status;
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 获取容器实例
 */
export function getContainer(): DIContainer {
  return DIContainer.getInstance();
}

/**
 * 注册组件到容器
 */
export function registerComponent<T>(
  key: string,
  factory: Factory<T>,
  destructor?: Destructor<T>
): void {
  const container = getContainer();
  container.register(key, factory, destructor);
}

/**
 * 从容器获取组件
 */
export function getComponent<T>(key: string): T {
  const container = getContainer();
  return container.get<T>(key);
}

/**
 * 重置所有组件
 */
export async function resetContainer(): Promise<void> {
  const container = getContainer();
  await container.resetAll();
}
