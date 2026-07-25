-- The agent's filesystem, as one table. Keyed by (project_id, path) so a single
-- database serves many projects; every query in the Worker is project-scoped.
CREATE TABLE IF NOT EXISTS files (
  project_id TEXT NOT NULL,
  path       TEXT NOT NULL,
  content    TEXT NOT NULL,
  PRIMARY KEY (project_id, path)
);

-- Usage log. Nothing reads this back, which is exactly why the Worker writes it
-- with ctx.waitUntil() instead of awaiting it (see src/worker.js).
CREATE TABLE IF NOT EXISTS turns (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  files_fetched INTEGER NOT NULL,
  total_files   INTEGER NOT NULL,
  usage         TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed the demo project. Re-running this file resets it, so `npm run db:setup`
-- is safe to repeat after the agent has edited things.
DELETE FROM files WHERE project_id = 'acme';

INSERT INTO files (project_id, path, content) VALUES
  ('acme', 'package.json', '{
  "name": "acme-api",
  "version": "1.2.0"
}
'),
  ('acme', 'README.md', '# acme-api

Internal orders service.
'),
  ('acme', 'src/index.ts', 'import { config } from ''./config''
console.log(''listening on'', config.port)
'),
  ('acme', 'src/config.ts', 'export const config = {
  port: 8080,
  region: "eu-west-1",
}
'),
  ('acme', 'src/routes/orders.ts', 'export const listOrders = () => db.query(''select * from orders'')
'),
  ('acme', 'src/routes/users.ts', 'export const listUsers = () => db.query(''select * from users'')
'),
  ('acme', 'src/routes/health.ts', 'export const health = () => ({ ok: true })
'),
  ('acme', 'src/utils/format.ts', 'export const money = (n) => `$${n.toFixed(2)}`
'),
  ('acme', 'src/utils/http.ts', 'export const get = (url) => fetch(url).then((r) => r.json())
'),
  ('acme', 'tests/orders.test.ts', 'test(''lists orders'', () => { /* ... */ })
');
