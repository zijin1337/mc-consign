import "server-only";
import { cache } from "react";
import { db, schema, type Tx } from "@/db";
import { SETTING_DEFAULTS, type SettingKey, type Settings } from "./settings-shared";

export { SETTING_DEFAULTS, SETTING_LABELS, type SettingKey, type Settings } from "./settings-shared";

/** 读取全部配置并与默认值合并，同一次渲染内缓存。 */
export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await db.select().from(schema.settings);
  const merged: Settings = { ...SETTING_DEFAULTS };
  for (const r of rows) {
    if (r.key in SETTING_DEFAULTS) {
      (merged as unknown as Record<string, unknown>)[r.key] = r.value;
    }
  }
  return merged;
});

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  return (await getSettings())[key];
}

export async function setSetting<K extends SettingKey>(key: K, value: Settings[K], operatorId: number | null, exec: Tx | typeof db = db) {
  await exec
    .insert(schema.settings)
    .values({ key, value, updatedBy: operatorId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value, updatedBy: operatorId, updatedAt: new Date() },
    });
}
