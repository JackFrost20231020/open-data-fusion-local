import { zhCN } from "./zh-CN";

export const LOCALE = "zh-CN";

export function t(key: string, params?: Record<string, string | number>): string {
  let text = zhCN[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

export function formatDateTime(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";
  return new Intl.DateTimeFormat(LOCALE, options).format(date);
}

export function formatDate(value: string | number | Date): string {
  return formatDateTime(value, { dateStyle: "medium", timeStyle: "short" });
}

export function formatTime(value: string | number | Date): string {
  return formatDateTime(value, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(LOCALE, options).format(value);
}

const navigationTitles: Record<string, string> = {
  Overview: "总览",
  Explorer: "资源浏览器",
  Sources: "数据源",
  Pipelines: "流水线",
  Models: "模型",
  Context: "上下文",
  Diagrams: "图纸",
  Matching: "匹配",
  Spatial: "空间",
  "Write-back": "回写",
  Audit: "审计",
  Explore: "探索",
  "Data engineering": "数据工程",
  Contextualize: "语境化",
  Govern: "治理",
};

export function navLabel(label: string): string {
  return navigationTitles[label] ?? t(label);
}

const statusTitles: Record<string, string> = {
  accepted: "已接受",
  rejected: "已拒绝",
  proposed: "待审核",
  draft: "草稿",
  published: "已发布",
  superseded: "已替代",
  failed: "失败",
  succeeded: "已成功",
  success: "成功",
  cancelled: "已取消",
  canceled: "已取消",
  completed: "已完成",
  processing: "处理中",
  pending: "待处理",
  approved: "已批准",
  blocked: "已阻止",
  enabled: "已启用",
  disabled: "已停用",
  loading: "加载中",
  error: "错误",
  ready: "就绪",
  idle: "空闲",
  degraded: "降级",
  forbidden: "无权限",
  unauthorized: "未授权",
  resolved: "已解决",
  cleared: "已解除",
  acknowledged: "已确认",
  active: "活动",
  replayed: "已重放",
  running: "运行中",
  standby: "备用",
  maintenance: "维护中",
  passed: "通过",
  awaiting_approval: "待审批",
  "awaiting approval": "待审批",
  online: "在线",
  offline: "离线",
  checking: "检查中",
  saving: "保存中",
  saved: "已保存",
  required: "必填",
  optional: "可选",
  good: "良好",
  uncertain: "不确定",
  bad: "不良",
  high: "高",
  low: "低",
  medium: "中",
  critical: "严重",
  warning: "警告",
  info: "信息",
};

export function statusLabel(status: string): string {
  return statusTitles[status] ?? statusTitles[status.replaceAll("_", " ")] ?? status;
}
