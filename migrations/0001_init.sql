CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  series TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,          -- compiled story JSON: pages + word breakdowns
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Everything Yara does: open, page, tap, read_aloud, finish.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  type TEXT NOT NULL,
  story_id TEXT,
  page INTEGER,
  word TEXT
);
CREATE INDEX events_type ON events (type, story_id);
