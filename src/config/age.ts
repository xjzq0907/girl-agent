/**
 * 角色年龄的全局限制。
 *
 * MIN_AGE — 最低年龄，低于此年龄无法创建角色。
 *   默认为 18（项目安全策略：不涉及未成年人相关内容）。
 * MAX_AGE — UI 滑块的上限。必要时可以提高。
 *
 * 这些常量在后台验证（storage/md、routes）和
 * WebUI（webui/src/lib/age-config.ts 通过 API 获取相同值）中都会导入使用。
 */
export const MIN_AGE = 18;
export const MAX_AGE = 45;

/** 将年龄限制在允许范围内。 */
export function clampAge(age: number): number {
  if (!Number.isFinite(age)) return MIN_AGE;
  if (age < MIN_AGE) return MIN_AGE;
  if (age > MAX_AGE) return MAX_AGE;
  return Math.round(age);
}

/** 如果年龄在允许范围内，返回 true。 */
export function isValidAge(age: number): boolean {
  return Number.isFinite(age) && age >= MIN_AGE && age <= MAX_AGE;
}
