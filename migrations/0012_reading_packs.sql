-- Private accepted reading derivatives. Originals and voice references never enter this registry.
CREATE TABLE reading_pack_imports (
  sub TEXT NOT NULL, id TEXT NOT NULL, manifest TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'staging', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  imported_at TEXT, PRIMARY KEY(sub, id)
);
CREATE TABLE reading_pack_assets (
  sub TEXT NOT NULL, pack_id TEXT NOT NULL, sha256 TEXT NOT NULL,
  size INTEGER NOT NULL, content_type TEXT NOT NULL, object_key TEXT NOT NULL,
  PRIMARY KEY(sub, pack_id, sha256)
);
CREATE TABLE reading_pack_stories (
  sub TEXT NOT NULL, pack_id TEXT NOT NULL, story_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
  PRIMARY KEY(sub, pack_id, story_id)
);
CREATE INDEX reading_pack_story_lookup ON reading_pack_stories(sub, story_id);
