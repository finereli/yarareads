-- The audio chosen for each phonics sound (an R2 key under sounds/), picked in the grown-ups Sound lab.
CREATE TABLE sound_picks (
  sound TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
