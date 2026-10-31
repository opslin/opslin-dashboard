/** Placeholder the API replaces with the app's own address at deploy time (mirrors opslin-api lib/env-placeholders.ts). */
export const APP_URL_PLACEHOLDER = "{{opslin.app_url}}";

const KEY = "[A-Za-z_][A-Za-z0-9_]*";
/** Names that normally hold the project's own address. */
const ADDRESS_NAME = /(URL|URI|HOST|DOMAIN|ORIGIN|ORIGINS|BASE|SITE|ENDPOINT)$/i;
/** Settings that point at other things (databases, caches, queues) must never be rewritten. */
const NOT_OWN_ADDRESS = /(DATABASE|DB|POSTGRES|MYSQL|MONGO|REDIS|CACHE|BROKER|QUEUE|SMTP|MAIL|AMQP|RABBIT|ELASTIC|S3|STORAGE|API_URL_INTERNAL)/i;
const LOCAL_VALUE = /^\s*["']?https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\/?["']?\s*$/i;

/**
 * Names of settings in a compose file that hold a localhost web address, such as `FRONTEND_URL: http://localhost:3000`.
 * Reads both the map form (`KEY: value`) and the list form (`- KEY=value`). Only the project's own address is returned:
 * anything that looks like a database, cache, queue or mail setting is left alone.
 */
export function findLocalAddressSettings(composeText: string): string[] {
    const found = new Set<string>();
    const map = new RegExp(`^\\s*(${KEY})\\s*:\\s*(.+?)\\s*$`);
    const list = new RegExp(`^\\s*-\\s*["']?(${KEY})=(.+?)["']?\\s*$`);
    for (const line of composeText.split(/\r?\n/)) {
        const match = map.exec(line) ?? list.exec(line);
        if (!match) continue;
        const [, key, value] = match;
        if (key && value && ADDRESS_NAME.test(key) && !NOT_OWN_ADDRESS.test(key) && LOCAL_VALUE.test(value)) found.add(key);
    }
    return [...found].sort();
}
