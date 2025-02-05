import { Database } from "bun:sqlite";
import { Elysia } from "elysia";

const db = new Database(":memory:");

type KVKey = string;

interface KVNamespace {
  namespace: string;
  key: KVKey;
}

// Validate table names to prevent SQL injection
function isValidTableName(name: string): boolean {
  return /^[a-zA-Z0-9_]+$/.test(name);
}

export default class kvMorning {
  async set(index: KVNamespace | KVKey, value: any) {
    const namespace = typeof index === "object" ? index.namespace : "default";
    const key = typeof index === "object" ? index.key : index;

    if (!isValidTableName(namespace)) {
      return false;
    }

    try {
      // Serialize the value
      const serializedValue = value;
      db.run(`CREATE TABLE IF NOT EXISTS ${namespace} (key TEXT NOT NULL PRIMARY KEY, value TEXT);`);
      const stmt = db.prepare(`INSERT OR REPLACE INTO ${namespace} (key, value) VALUES (?, ?)`);
      const result = stmt.run(key, serializedValue);
      return result.changes >= 1;
    } catch (error: unknown) {
      console.log("[KVMorning] ERROR:", (error as Error).toString());
      return false;
    }
  }

  async get(index: KVNamespace | KVKey) {
    const namespace = typeof index === "object" ? index.namespace : "default";
    const key = typeof index === "object" ? index.key : index;

    if (!isValidTableName(namespace)) {
      return null;
    }

    try {
      const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(namespace);
      if (!tableExists) {
        return null;
      }
      const stmt = db.prepare(`SELECT value FROM ${namespace} WHERE key = ?`);
      const result = stmt.get(key) as { value: string } | null;
      return result?.value
    } catch (error: unknown) {
      console.log("[KVMorning] ERROR:", (error as Error).toString());
      return null;
    }
  }

  async del(index: KVNamespace | KVKey) {
    const namespace = typeof index === "object" ? index.namespace : "default";
    const key = typeof index === "object" ? index.key : index;

    if (!isValidTableName(namespace)) {
      return false;
    }

    try {
      const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(namespace);
      if (!tableExists) {
        return false;
      }
      const stmt = db.prepare(`DELETE FROM ${namespace} WHERE key = ?`);
      const result = stmt.run(key);
      return result.changes === 1;
    } catch (error: unknown) {
      console.log("[KVMorning] ERROR:", (error as Error).toString());
      return false;
    }
  }

  async destroy(index: KVNamespace) {
    const namespace = index.namespace;

    if (!isValidTableName(namespace)) {
      return false;
    }

    try {
      const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(namespace);
      if (!tableExists) {
        return false;
      }
      db.run(`DROP TABLE ${namespace}`);
      return true;
    } catch (error: unknown) {
      console.log("[KVMorning] ERROR:", (error as Error).toString());
      return false;
    }
  }
}

const kv = new kvMorning();

const app = new Elysia()
  .get("/", () => "Hello Elysia")
  .get("/set", () => kv.set({ namespace: "test", key: "test" }, "test"))
  .get("/get", () => kv.get({ namespace: "test", key: "test" }))
  .listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);