-- CourtOS Supabase Schema & RPC Engine
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLES
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'MINI', -- MINI, CORE, MAJOR
  status TEXT NOT NULL DEFAULT 'SETUP', -- SETUP, SEEDING, LADDER, PLAYOFFS, FINISHED
  current_round_index INTEGER DEFAULT -1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all columns exist for existing tables (Migrations)
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'MINI';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'SETUP';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS current_round_index INTEGER DEFAULT -1;

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  contact TEXT,
  dupr_id TEXT,
  jersey_number TEXT NOT NULL,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  rank INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  point_diff INTEGER DEFAULT 0,
  points_scored INTEGER DEFAULT 0,
  pod_wins INTEGER DEFAULT 0,
  last_rank INTEGER DEFAULT 0,
  avatar_url TEXT
);

-- Ensure all columns exist for existing tables (Migrations)
ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  type TEXT NOT NULL, -- SEEDING, LADDER
  status TEXT NOT NULL DEFAULT 'PENDING' -- PENDING, LOCKED
);

CREATE TABLE IF NOT EXISTS pods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id UUID REFERENCES rounds(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  court_name TEXT NOT NULL,
  pod_name TEXT NOT NULL, -- A, B
  status TEXT NOT NULL DEFAULT 'PENDING' -- PENDING, LOCKED
);

-- Migration for pods
ALTER TABLE pods ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS pod_players (
  pod_id UUID REFERENCES pods(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  pod_rank INTEGER,
  PRIMARY KEY (pod_id, player_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pod_id UUID REFERENCES pods(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  p1_id UUID REFERENCES players(id),
  p2_id UUID REFERENCES players(id),
  p3_id UUID REFERENCES players(id),
  p4_id UUID REFERENCES players(id),
  score1 INTEGER DEFAULT 0,
  score2 INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING' -- PENDING, LOCKED
);

-- Migration for matches
ALTER TABLE matches ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS playoff_teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  captain_id UUID REFERENCES players(id),
  partner_id UUID REFERENCES players(id),
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playoff_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  team1_id UUID REFERENCES playoff_teams(id),
  team2_id UUID REFERENCES playoff_teams(id),
  score1 INTEGER DEFAULT 0,
  score2 INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  stage TEXT NOT NULL -- SEMIS, FINALS
);

-- 2. HELPER FUNCTIONS
DROP FUNCTION IF EXISTS generate_round_pods(UUID, UUID);
CREATE OR REPLACE FUNCTION generate_round_pods(p_tournament_id UUID, p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_mode TEXT;
  v_num_courts INTEGER;
  v_court_names TEXT[] := ARRAY['Throne', 'Challenger', 'Contender', 'Survival'];
  v_player_ids UUID[];
  v_pod_id UUID;
  v_pod_players UUID[];
BEGIN
  SELECT mode INTO v_mode FROM tournaments WHERE id = p_tournament_id;
  v_num_courts := CASE WHEN v_mode = 'MAJOR' THEN 4 WHEN v_mode = 'CORE' THEN 3 ELSE 2 END;
  
  -- Get players sorted by rank
  SELECT array_agg(id ORDER BY rank ASC) INTO v_player_ids FROM players WHERE tournament_id = p_tournament_id;
  
  FOR i IN 0..(v_num_courts - 1) LOOP
    -- Pod A
    INSERT INTO pods (round_id, tournament_id, court_name, pod_name)
    VALUES (p_round_id, p_tournament_id, v_court_names[i+1], 'A')
    RETURNING id INTO v_pod_id;
    
    v_pod_players := v_player_ids[(i*8 + 1):(i*8 + 4)];
    
    INSERT INTO pod_players (pod_id, player_id)
    SELECT v_pod_id, unnest(v_pod_players);
    
    -- Matches for Pod A (Americano: 1+2 vs 3+4, 1+3 vs 2+4, 1+4 vs 2+3)
    INSERT INTO matches (pod_id, tournament_id, p1_id, p2_id, p3_id, p4_id) VALUES
    (v_pod_id, p_tournament_id, v_pod_players[1], v_pod_players[2], v_pod_players[3], v_pod_players[4]),
    (v_pod_id, p_tournament_id, v_pod_players[1], v_pod_players[3], v_pod_players[2], v_pod_players[4]),
    (v_pod_id, p_tournament_id, v_pod_players[1], v_pod_players[4], v_pod_players[2], v_pod_players[3]);

    -- Pod B
    INSERT INTO pods (round_id, tournament_id, court_name, pod_name)
    VALUES (p_round_id, p_tournament_id, v_court_names[i+1], 'B')
    RETURNING id INTO v_pod_id;
    
    v_pod_players := v_player_ids[(i*8 + 5):(i*8 + 8)];
    
    INSERT INTO pod_players (pod_id, player_id)
    SELECT v_pod_id, unnest(v_pod_players);
    
    -- Matches for Pod B
    INSERT INTO matches (pod_id, tournament_id, p1_id, p2_id, p3_id, p4_id) VALUES
    (v_pod_id, p_tournament_id, v_pod_players[1], v_pod_players[2], v_pod_players[3], v_pod_players[4]),
    (v_pod_id, p_tournament_id, v_pod_players[1], v_pod_players[3], v_pod_players[2], v_pod_players[4]),
    (v_pod_id, p_tournament_id, v_pod_players[1], v_pod_players[4], v_pod_players[2], v_pod_players[3]);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 3. RPC: SETUP TOURNAMENT
DROP FUNCTION IF EXISTS setup_tournament(TEXT, TEXT, JSONB);
CREATE OR REPLACE FUNCTION setup_tournament(p_name TEXT, p_mode TEXT, p_players JSONB)
RETURNS UUID AS $$
DECLARE
  v_tournament_id UUID;
  v_player JSONB;
BEGIN
  INSERT INTO tournaments (name, mode) VALUES (p_name, p_mode) RETURNING id INTO v_tournament_id;
  
  FOR v_player IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    INSERT INTO players (name, contact, dupr_id, jersey_number, tournament_id, avatar_url)
    VALUES (v_player->>'name', v_player->>'contact', v_player->>'duprId', v_player->>'jerseyNumber', v_tournament_id, v_player->>'avatarUrl');
  END LOOP;
  
  RETURN v_tournament_id;
END;
$$ LANGUAGE plpgsql;

-- 4. RPC: START SEEDING
DROP FUNCTION IF EXISTS start_seeding(UUID);
CREATE OR REPLACE FUNCTION start_seeding(p_tournament_id UUID)
RETURNS VOID AS $$
DECLARE
  v_round_id UUID;
BEGIN
  -- Randomize initial ranks
  WITH shuffled AS (
    SELECT id, row_number() OVER (ORDER BY random()) as new_rank
    FROM players
    WHERE tournament_id = p_tournament_id
  )
  UPDATE players p
  SET rank = s.new_rank
  FROM shuffled s
  WHERE p.id = s.id;
  
  UPDATE tournaments SET status = 'SEEDING', current_round_index = 0 WHERE id = p_tournament_id;
  
  INSERT INTO rounds (tournament_id, number, type)
  VALUES (p_tournament_id, 1, 'SEEDING')
  RETURNING id INTO v_round_id;
  
  PERFORM generate_round_pods(p_tournament_id, v_round_id);
END;
$$ LANGUAGE plpgsql;

-- 5. RPC: SUBMIT POD
DROP FUNCTION IF EXISTS submit_pod(UUID, JSONB);
CREATE OR REPLACE FUNCTION submit_pod(p_pod_id UUID, p_matches JSONB)
RETURNS VOID AS $$
DECLARE
  v_match JSONB;
  v_round_id UUID;
  v_tournament_id UUID;
  v_current_round_index INTEGER;
  v_mode TEXT;
BEGIN
  -- 1. Update Match Scores
  FOR v_match IN SELECT * FROM jsonb_array_elements(p_matches) LOOP
    UPDATE matches 
    SET score1 = (v_match->>'score1')::INTEGER, 
        score2 = (v_match->>'score2')::INTEGER, 
        status = 'LOCKED'
    WHERE id = (v_match->>'id')::UUID;
  END LOOP;
  
  UPDATE pods SET status = 'LOCKED' WHERE id = p_pod_id;
  
  SELECT round_id INTO v_round_id FROM pods WHERE id = p_pod_id;
  SELECT tournament_id INTO v_tournament_id FROM rounds WHERE id = v_round_id;
  
  -- 2. Check if Round is complete
  IF NOT EXISTS (SELECT 1 FROM pods WHERE round_id = v_round_id AND status = 'PENDING') THEN
    UPDATE rounds SET status = 'LOCKED' WHERE id = v_round_id;
    
    -- 3. Process Round Results (Ranking & Movement)
    -- 3. Process Round Results (Ranking & Movement)
    -- Calculate stats for ALL players in the round
    CREATE TEMP TABLE temp_round_stats AS
    SELECT 
      p.id as player_id,
      pd.id as pod_id,
      SUM(CASE WHEN m.p1_id = p.id OR m.p2_id = p.id THEN 
            CASE WHEN m.score1 > m.score2 THEN 2 ELSE 0 END
          ELSE
            CASE WHEN m.score2 > m.score1 THEN 2 ELSE 0 END
          END) as pts,
      SUM(CASE WHEN m.p1_id = p.id OR m.p2_id = p.id THEN m.score1 - m.score2 ELSE m.score2 - m.score1 END) as diff,
      SUM(CASE WHEN m.p1_id = p.id OR m.p2_id = p.id THEN m.score1 ELSE m.score2 END) as scored,
      COUNT(*) FILTER (WHERE (m.p1_id = p.id OR m.p2_id = p.id AND m.score1 > m.score2) OR (m.p3_id = p.id OR m.p4_id = p.id AND m.score2 > m.score1)) as wins
    FROM players p
    JOIN pod_players pp ON p.id = pp.player_id
    JOIN pods pd ON pp.pod_id = pd.id
    JOIN matches m ON m.pod_id = pd.id AND (m.p1_id = p.id OR m.p2_id = p.id OR m.p3_id = p.id OR m.p4_id = p.id)
    WHERE pd.round_id = v_round_id
    GROUP BY p.id, pd.id;

    -- Update pod_players with pod_rank
    UPDATE pod_players pp
    SET pod_rank = sub.pod_rank
    FROM (
      SELECT 
        player_id, 
        pod_id,
        row_number() OVER (PARTITION BY pod_id ORDER BY pts DESC, diff DESC, scored DESC, wins DESC, player_id ASC) as pod_rank
      FROM temp_round_stats
    ) sub
    WHERE pp.player_id = sub.player_id AND pp.pod_id = sub.pod_id;

    -- Update global player stats
    UPDATE players p
    SET points = p.points + s.pts,
        point_diff = p.point_diff + s.diff,
        points_scored = p.points_scored + s.scored,
        pod_wins = p.pod_wins + CASE WHEN s.wins = 3 THEN 1 ELSE 0 END
    FROM temp_round_stats s
    WHERE p.id = s.player_id;

    DROP TABLE temp_round_stats;

    -- 4. GLOBAL RANKING REBUILD (DETERMINISTIC)
    UPDATE players p
    SET last_rank = p.rank
    WHERE tournament_id = v_tournament_id;

    WITH ranked AS (
      SELECT id, row_number() OVER (
        ORDER BY points DESC, point_diff DESC, points_scored DESC, pod_wins DESC, id ASC
      ) as new_rank
      FROM players
      WHERE tournament_id = v_tournament_id
    )
    UPDATE players p
    SET rank = r.new_rank
    FROM ranked r
    WHERE p.id = r.id;

    -- 5. Advance Tournament Status
    SELECT status, current_round_index INTO v_mode, v_current_round_index FROM tournaments WHERE id = v_tournament_id;
    
    IF v_mode = 'SEEDING' THEN
      UPDATE tournaments SET status = 'LADDER', current_round_index = 1 WHERE id = v_tournament_id;
      INSERT INTO rounds (tournament_id, number, type) VALUES (v_tournament_id, 2, 'LADDER') RETURNING id INTO v_round_id;
      PERFORM generate_round_pods(v_tournament_id, v_round_id);
    ELSIF v_mode = 'LADDER' THEN
      IF v_current_round_index < 3 THEN
        UPDATE tournaments SET current_round_index = v_current_round_index + 1 WHERE id = v_tournament_id;
        INSERT INTO rounds (tournament_id, number, type) VALUES (v_tournament_id, v_current_round_index + 2, 'LADDER') RETURNING id INTO v_round_id;
        PERFORM generate_round_pods(v_tournament_id, v_round_id);
      ELSE
        UPDATE tournaments SET status = 'PLAYOFFS' WHERE id = v_tournament_id;
      END IF;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 6. RPC: DRAFT PARTNER
DROP FUNCTION IF EXISTS draft_partner(UUID, UUID, UUID);
CREATE OR REPLACE FUNCTION draft_partner(p_tournament_id UUID, p_captain_id UUID, p_partner_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_captain_name TEXT;
  v_partner_name TEXT;
BEGIN
  SELECT name INTO v_captain_name FROM players WHERE id = p_captain_id;
  SELECT name INTO v_partner_name FROM players WHERE id = p_partner_id;
  
  INSERT INTO playoff_teams (tournament_id, captain_id, partner_id, name)
  VALUES (p_tournament_id, p_captain_id, p_partner_id, v_captain_name || ' / ' || v_partner_name);

  RETURN get_tournament_state(p_tournament_id);
END;
$$ LANGUAGE plpgsql;

-- 7. RPC: GENERATE PLAYOFF BRACKET
DROP FUNCTION IF EXISTS generate_playoffs(UUID);
CREATE OR REPLACE FUNCTION generate_playoffs(p_tournament_id UUID)
RETURNS VOID AS $$
DECLARE
  v_team_ids UUID[];
BEGIN
  SELECT array_agg(id ORDER BY (SELECT rank FROM players WHERE id = captain_id) ASC) 
  INTO v_team_ids 
  FROM playoff_teams 
  WHERE tournament_id = p_tournament_id;
  
  -- Semis: 1 vs 4, 2 vs 3
  INSERT INTO playoff_matches (tournament_id, team1_id, team2_id, stage) VALUES
  (p_tournament_id, v_team_ids[1], v_team_ids[4], 'SEMIS'),
  (p_tournament_id, v_team_ids[2], v_team_ids[3], 'SEMIS');
END;
$$ LANGUAGE plpgsql;

-- 8. RPC: SUBMIT PLAYOFF MATCH
DROP FUNCTION IF EXISTS submit_playoff_match(UUID, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION submit_playoff_match(p_match_id UUID, p_score1 INTEGER, p_score2 INTEGER)
RETURNS VOID AS $$
DECLARE
  v_tournament_id UUID;
  v_stage TEXT;
  v_winner_id UUID;
  v_semis_count INTEGER;
  v_semis_locked_count INTEGER;
  v_finalists UUID[];
BEGIN
  UPDATE playoff_matches 
  SET score1 = p_score1, score2 = p_score2, status = 'LOCKED' 
  WHERE id = p_match_id
  RETURNING tournament_id, stage INTO v_tournament_id, v_stage;
  
  IF v_stage = 'SEMIS' THEN
    -- Check if both semis are done
    SELECT count(*) INTO v_semis_count FROM playoff_matches WHERE tournament_id = v_tournament_id AND stage = 'SEMIS';
    SELECT count(*) INTO v_semis_locked_count FROM playoff_matches WHERE tournament_id = v_tournament_id AND stage = 'SEMIS' AND status = 'LOCKED';
    
    IF v_semis_count = v_semis_locked_count THEN
      -- Get winners
      SELECT array_agg(CASE WHEN score1 > score2 THEN team1_id ELSE team2_id END)
      INTO v_finalists
      FROM playoff_matches
      WHERE tournament_id = v_tournament_id AND stage = 'SEMIS';
      
      -- Create Final
      INSERT INTO playoff_matches (tournament_id, team1_id, team2_id, stage)
      VALUES (v_tournament_id, v_finalists[1], v_finalists[2], 'FINALS');
    END IF;
  ELSIF v_stage = 'FINALS' THEN
    UPDATE tournaments SET status = 'FINISHED' WHERE id = v_tournament_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 10. RPC: RUN MIGRATIONS
DROP FUNCTION IF EXISTS run_migrations();
CREATE OR REPLACE FUNCTION run_migrations()
RETURNS VOID AS $$
BEGIN
  -- Ensure all columns exist for existing tables
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournaments' AND column_name='mode') THEN
    ALTER TABLE tournaments ADD COLUMN mode TEXT NOT NULL DEFAULT 'MINI';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournaments' AND column_name='status') THEN
    ALTER TABLE tournaments ADD COLUMN status TEXT NOT NULL DEFAULT 'SETUP';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournaments' AND column_name='current_round_index') THEN
    ALTER TABLE tournaments ADD COLUMN current_round_index INTEGER DEFAULT -1;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 11. RPC: GET TOURNAMENT STATE
DROP FUNCTION IF EXISTS get_tournament_state(UUID);
CREATE OR REPLACE FUNCTION get_tournament_state(p_tournament_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'mode', COALESCE(to_jsonb(t)->>'mode', 'MINI'),
    'status', COALESCE(to_jsonb(t)->>'status', 'SETUP'),
    'currentRoundIndex', COALESCE((to_jsonb(t)->>'current_round_index')::INTEGER, -1),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'contact', p.contact,
        'duprId', p.dupr_id,
        'jerseyNumber', p.jersey_number,
        'rank', p.rank,
        'points', p.points,
        'pointDiff', p.point_diff,
        'pointsScored', p.points_scored,
        'podWins', p.pod_wins,
        'lastRank', p.last_rank,
        'avatarUrl', p.avatar_url
      )) FROM players p WHERE p.tournament_id = t.id
    ), '[]'::jsonb),
    'rounds', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'number', r.number,
        'type', r.type,
        'status', r.status,
        'pods', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', pd.id,
            'courtName', pd.court_name,
            'podName', pd.pod_name,
            'status', pd.status,
            'playerIds', COALESCE((SELECT jsonb_agg(player_id) FROM pod_players WHERE pod_id = pd.id), '[]'::jsonb),
            'matches', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', m.id,
                'playerIds', jsonb_build_array(m.p1_id, m.p2_id, m.p3_id, m.p4_id),
                'score1', m.score1,
                'score2', m.score2,
                'status', m.status
              )) FROM matches m WHERE m.pod_id = pd.id
            ), '[]'::jsonb)
          )) FROM pods pd WHERE pd.round_id = r.id
        ), '[]'::jsonb)
      )) FROM rounds r WHERE r.tournament_id = t.id
    ), '[]'::jsonb),
    'playoffTeams', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pt.id,
        'captainId', pt.captain_id,
        'partnerId', pt.partner_id,
        'name', pt.name
      )) FROM playoff_teams pt WHERE pt.tournament_id = t.id
    ), '[]'::jsonb),
    'playoffMatches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pm.id,
        'team1Id', pm.team1_id,
        'team2Id', pm.team2_id,
        'score1', pm.score1,
        'score2', pm.score2,
        'status', pm.status,
        'stage', pm.stage
      )) FROM playoff_matches pm WHERE pm.tournament_id = t.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM tournaments t
  WHERE t.id = p_tournament_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 12. RPC: FINISH TOURNAMENT
DROP FUNCTION IF EXISTS finish_tournament(UUID);
CREATE OR REPLACE FUNCTION finish_tournament(p_tournament_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE tournaments SET status = 'FINISHED' WHERE id = p_tournament_id;
END;
$$ LANGUAGE plpgsql;

-- 13. ROW LEVEL SECURITY (RLS)
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE pods ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE playoff_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE playoff_matches ENABLE ROW LEVEL SECURITY;

-- 13. REALTIME (Enable for all tables)
-- This allows the Hype Board and Operator Desk to update instantly
BEGIN;
  -- Set replica identity to FULL for tables we filter by tournament_id
  ALTER TABLE tournaments REPLICA IDENTITY FULL;
  ALTER TABLE players REPLICA IDENTITY FULL;
  ALTER TABLE rounds REPLICA IDENTITY FULL;
  ALTER TABLE pods REPLICA IDENTITY FULL;
  ALTER TABLE matches REPLICA IDENTITY FULL;
  ALTER TABLE playoff_teams REPLICA IDENTITY FULL;
  ALTER TABLE playoff_matches REPLICA IDENTITY FULL;

  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE 
    tournaments, 
    players, 
    rounds, 
    pods, 
    pod_players, 
    matches, 
    playoff_teams, 
    playoff_matches;
COMMIT;

-- Basic Policies (Allow all for now, to be tightened later)
DROP POLICY IF EXISTS "Allow public all access" ON tournaments;
CREATE POLICY "Allow public all access" ON tournaments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all access" ON players;
CREATE POLICY "Allow public all access" ON players FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all access" ON rounds;
CREATE POLICY "Allow public all access" ON rounds FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all access" ON pods;
CREATE POLICY "Allow public all access" ON pods FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all access" ON pod_players;
CREATE POLICY "Allow public all access" ON pod_players FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all access" ON matches;
CREATE POLICY "Allow public all access" ON matches FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all access" ON playoff_teams;
CREATE POLICY "Allow public all access" ON playoff_teams FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all access" ON playoff_matches;
CREATE POLICY "Allow public all access" ON playoff_matches FOR ALL USING (true) WITH CHECK (true);

-- Allow all for service role (implicit, but good to keep in mind)
-- For the app, we'll use the service role key on the backend to bypass RLS for setup/reset
