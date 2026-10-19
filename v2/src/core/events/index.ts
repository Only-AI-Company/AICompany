/**
 * AI Company v2 - 事件驱动核心
 *
 * 导出所有事件驱动相关模块
 */

// 事件总线
export {
  EventBus,
  getEventBus,
  type SystemEvent,
  type UserInputEvent,
  type TimeTriggeredEvent,
  type TaskEvent,
  type OutputEvent,
  type NotificationEvent,
  type DecisionEvent,
  type EmployeePerformanceEvent,
  type InteractionEvent,
  type InteractionOption,
  type ProgressEvent,
} from './EventBus.js';

// 事件采集器
export {
  EventCollector,
  getEventCollector,
  resetEventCollector,
  type EventCollectorOptions,
  type CollectorStats,
} from './EventCollector.js';

// 任务复盘器
export {
  TaskReviewer,
  getTaskReviewer,
  resetTaskReviewer,
} from './TaskReviewer.js';

// 核心处理流程
export {
  CoreProcess,
  getCoreProcess,
} from './CoreProcess.js';

// 结果分发器
export {
  ResultRouter,
  getResultRouter,
  resetResultRouter,
} from './ResultRouter.js';

// 交互管理器
export {
  InteractionManager,
  getInteractionManager,
  type InteractionRequest,
  type InteractionResponse,
} from './InteractionManager.js';

// 任务调度器
export {
  TaskScheduler,
  getTaskScheduler,
} from '../scheduling/TaskScheduler.js';
