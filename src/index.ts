import { Database } from "bun:sqlite";
import { Elysia } from "elysia";

const db = new Database(":memory:");

type KVKey = string;

interface KVNamespace {
  namespace: string;
  key: KVKey;
}

interface contextBody {
  namespace?: string;
  key: KVKey;
  value: any;
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
  .post("/", async function (ctx) {
    const body = ctx.body as contextBody
    const namespace = body?.namespace ?? "default_kv";
    const key = body?.key;
    const value = body?.value;
    if (!key || !value) {
      return new Response(JSON.stringify({ success: false, error: "Missing key or value" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (namespace) {
      const result = await kv.set({ namespace, key }, value);
      if (result) {
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      } else {
        return new Response(JSON.stringify({ success: false, error: "Failed to set value" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
    else {
      const result = await kv.set(key, value);
      if (result) {
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      } else {
        return new Response(JSON.stringify({ success: false, error: "Failed to set value" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
  })
  .get("/", async function (ctx) {
    const namespace = ctx.query.namespace ?? "default_kv";
    const key = ctx.query.key;
    if (!key) {
      return new Response(JSON.stringify({ success: false, error: "Missing key" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (namespace) {
      const result = await kv.get({ namespace, key });
      if (result) {
        return new Response(JSON.stringify({ success: true, data: result }), { status: 200, headers: { "Content-Type": "application/json" } });
      } else {
        return new Response(JSON.stringify({ success: false, error: "Failed to get value" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
    else {
      const result = kv.get(key);
      if (result) {
        return new Response(JSON.stringify({ success: false, data: result }), { status: 200, headers: { "Content-Type": "application/json" } });
      } else {
        return new Response(JSON.stringify({ success: false, error: "Failed to get value" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
  })
  .delete("/", async function (ctx) {
    const body = ctx.body as contextBody
    const namespace = body.namespace ?? "default_kv";
    const key = body.key;
    if (!key) {
      return new Response(JSON.stringify({ success: false, error: "Missing key" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (namespace) {
      const result = await kv.del({ namespace, key });
      if (result) {
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      } else {
        return new Response(JSON.stringify({ success: false, error: "Failed to delete value" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
    else {
      const result = await kv.del(key);
      if (result) {
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      } else {
        return new Response(JSON.stringify({ success: false, error: "Failed to delete value" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
  })
  .listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);