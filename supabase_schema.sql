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
  last_rank INTEGER DEFAULT 0
);

-- Ensure all columns exist for existing tables (Migrations)

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
RETURNS UUID 
SECURITY DEFINER
AS $$
DECLARE
  v_tournament_id UUID;
  v_player JSONB;
BEGIN
  INSERT INTO tournaments (name, mode) VALUES (p_name, p_mode) RETURNING id INTO v_tournament_id;
  
  FOR v_player IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    INSERT INTO players (name, contact, dupr_id, jersey_number, tournament_id)
    VALUES (v_player->>'name', v_player->>'contact', v_player->>'duprId', v_player->>'jerseyNumber', v_tournament_id);
  END LOOP;
  
  RETURN v_tournament_id;
END;
$$ LANGUAGE plpgsql;

-- 4. RPC: START SEEDING
DROP FUNCTION IF EXISTS start_seeding(UUID);
CREATE OR REPLACE FUNCTION start_seeding(p_tournament_id UUID)
RETURNS VOID 
SECURITY DEFINER
AS $$
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
RETURNS JSONB 
SECURITY DEFINER
AS $$
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
      COUNT(*) FILTER (
        WHERE (
          (m.p1_id = p.id OR m.p2_id = p.id) AND m.score1 > m.score2
        ) OR (
          (m.p3_id = p.id OR m.p4_id = p.id) AND m.score2 > m.score1
        )
      ) as wins
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

    -- 4. MOVEMENT MATRIX (POD-BASED)
    CREATE TEMP TABLE temp_movement (
      player_id UUID,
      new_rank INTEGER
    );

    WITH ordered_pods AS (
      SELECT 
        p.id as pod_id,
        p.court_name,
        p.pod_name,
        row_number() OVER (ORDER BY p.court_name, p.pod_name) as pod_index
      FROM pods p
      WHERE p.round_id = v_round_id
    ),
    pod_results AS (
      SELECT 
        pp.player_id,
        pp.pod_rank,
        op.pod_index
      FROM pod_players pp
      JOIN ordered_pods op ON pp.pod_id = op.pod_id
    ),
    movement AS (
      SELECT 
        player_id,
        pod_rank,
        pod_index,
        CASE
          -- TOP POD
          WHEN pod_index = 1 AND pod_rank <= 2 THEN pod_index
          WHEN pod_index = 1 AND pod_rank > 2 THEN pod_index + 1
          
          -- BOTTOM POD
          WHEN pod_index = (SELECT MAX(pod_index) FROM ordered_pods) AND pod_rank <= 2 THEN pod_index - 1
          WHEN pod_index = (SELECT MAX(pod_index) FROM ordered_pods) AND pod_rank > 2 THEN pod_index
          
          -- MIDDLE PODS
          WHEN pod_rank <= 2 THEN pod_index - 1
          ELSE pod_index + 1
        END as new_pod_index
      FROM pod_results
    ),
    ranked AS (
      SELECT 
        m.player_id,
        row_number() OVER (ORDER BY m.new_pod_index, m.pod_rank) as new_rank
      FROM movement m
    )
    INSERT INTO temp_movement
    SELECT player_id, new_rank FROM ranked;

    -- Apply ranks
    UPDATE players p
    SET last_rank = p.rank,
        rank = tm.new_rank
    FROM temp_movement tm
    WHERE p.id = tm.player_id;

    DROP TABLE temp_movement;

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

  RETURN get_tournament_state(v_tournament_id);
END;
$$ LANGUAGE plpgsql;

-- 6. RPC: DRAFT PARTNER
DROP FUNCTION IF EXISTS draft_partner(UUID, UUID, UUID);
CREATE OR REPLACE FUNCTION draft_partner(p_tournament_id UUID, p_captain_id UUID, p_partner_id UUID)
RETURNS JSONB 
SECURITY DEFINER
AS $$
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
RETURNS JSONB 
SECURITY DEFINER
AS $$
DECLARE
  v_team_ids UUID[];
  v_count INTEGER;
BEGIN
  SELECT array_agg(id ORDER BY (SELECT rank FROM players WHERE id = captain_id) ASC) 
  INTO v_team_ids 
  FROM playoff_teams 
  WHERE tournament_id = p_tournament_id;
  
  v_count := array_length(v_team_ids, 1);
  
  IF v_count < 4 THEN
    RAISE EXCEPTION 'Cannot generate playoffs: only % teams found, need 4', v_count;
  END IF;

  -- Semis: 1 vs 4, 2 vs 3
  INSERT INTO playoff_matches (tournament_id, team1_id, team2_id, stage, status) VALUES
  (p_tournament_id, v_team_ids[1], v_team_ids[4], 'SEMIS', 'PENDING'),
  (p_tournament_id, v_team_ids[2], v_team_ids[3], 'SEMIS', 'PENDING');

  -- Final (TBD)
  INSERT INTO playoff_matches (tournament_id, team1_id, team2_id, stage, status) VALUES
  (p_tournament_id, NULL, NULL, 'FINALS', 'LOCKED');

  RETURN get_tournament_state(p_tournament_id);
END;
$$ LANGUAGE plpgsql;

-- 8. RPC: SUBMIT PLAYOFF SCORE
DROP FUNCTION IF EXISTS submit_playoff_score(UUID, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION submit_playoff_score(p_match_id UUID, p_score1 INTEGER, p_score2 INTEGER)
RETURNS JSONB 
SECURITY DEFINER
AS $$
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
      FROM (
        SELECT team1_id, team2_id, score1, score2 
        FROM playoff_matches 
        WHERE tournament_id = v_tournament_id AND stage = 'SEMIS'
        ORDER BY id ASC -- Deterministic order
      ) sub;
      
      -- Update Final
      UPDATE playoff_matches 
      SET team1_id = v_finalists[1], team2_id = v_finalists[2], status = 'PENDING'
      WHERE tournament_id = v_tournament_id AND stage = 'FINALS';
    END IF;
  ELSIF v_stage = 'FINALS' THEN
    UPDATE tournaments SET status = 'FINISHED' WHERE id = v_tournament_id;
  END IF;

  RETURN get_tournament_state(v_tournament_id);
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
RETURNS JSONB 
SECURITY DEFINER
AS $$
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
        'lastRank', p.last_rank
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
RETURNS JSONB 
SECURITY DEFINER
AS $$
BEGIN
  UPDATE tournaments SET status = 'FINISHED' WHERE id = p_tournament_id;
  RETURN get_tournament_state(p_tournament_id);
END;
$$ LANGUAGE plpgsql;

-- 13. RPC: RESET TOURNAMENT
DROP FUNCTION IF EXISTS reset_tournament(UUID);
CREATE OR REPLACE FUNCTION reset_tournament(p_tournament_id UUID)
RETURNS JSONB 
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM matches WHERE tournament_id = p_tournament_id;
  DELETE FROM playoff_matches WHERE tournament_id = p_tournament_id;
  DELETE FROM playoff_teams WHERE tournament_id = p_tournament_id;
  DELETE FROM rounds WHERE tournament_id = p_tournament_id;
  
  UPDATE tournaments 
  SET status = 'SETUP', current_round_index = 0 
  WHERE id = p_tournament_id;
  
  UPDATE players 
  SET points = 0, point_diff = 0, points_scored = 0, pod_wins = 0, rank = 0, last_rank = 0
  WHERE tournament_id = p_tournament_id;
  
  RETURN get_tournament_state(p_tournament_id);
END;
$$ LANGUAGE plpgsql;

-- 14. RPC: ADVANCE TOURNAMENT
DROP FUNCTION IF EXISTS advance_tournament(UUID);
CREATE OR REPLACE FUNCTION advance_tournament(p_tournament_id UUID)
RETURNS JSONB 
SECURITY DEFINER
AS $$
DECLARE
  v_status TEXT;
  v_round_idx INTEGER;
  v_round_id UUID;
BEGIN
  SELECT status, current_round_index INTO v_status, v_round_idx FROM tournaments WHERE id = p_tournament_id;
  
  IF v_status = 'PLAYOFFS' THEN
    -- Generate playoffs if not already there
    IF NOT EXISTS (SELECT 1 FROM playoff_matches WHERE tournament_id = p_tournament_id) THEN
      PERFORM generate_playoffs(p_tournament_id);
    END IF;
  ELSIF v_status = 'SEEDING' THEN
    UPDATE tournaments SET status = 'LADDER', current_round_index = 1 WHERE id = p_tournament_id;
    INSERT INTO rounds (tournament_id, number, type) VALUES (p_tournament_id, 2, 'LADDER') RETURNING id INTO v_round_id;
    PERFORM generate_round_pods(p_tournament_id, v_round_id);
  ELSIF v_status = 'LADDER' THEN
    IF v_round_idx < 3 THEN
      UPDATE tournaments SET current_round_index = v_round_idx + 1 WHERE id = p_tournament_id;
      INSERT INTO rounds (tournament_id, number, type) VALUES (p_tournament_id, v_round_idx + 2, 'LADDER') RETURNING id INTO v_round_id;
      PERFORM generate_round_pods(p_tournament_id, v_round_id);
    ELSE
      UPDATE tournaments SET status = 'PLAYOFFS' WHERE id = p_tournament_id;
    END IF;
  END IF;
  
  RETURN get_tournament_state(p_tournament_id);
END;
$$ LANGUAGE plpgsql;

-- 15. RPC: DELETE TOURNAMENT
DROP FUNCTION IF EXISTS delete_tournament(UUID);
CREATE OR REPLACE FUNCTION delete_tournament(p_tournament_id UUID)
RETURNS VOID 
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM tournaments WHERE id = p_tournament_id;
END;
$$ LANGUAGE plpgsql;

-- 16. ROW LEVEL SECURITY (RLS) - DISABLED FOR STABILITY
ALTER TABLE tournaments DISABLE ROW LEVEL SECURITY;
ALTER TABLE players DISABLE ROW LEVEL SECURITY;
ALTER TABLE rounds DISABLE ROW LEVEL SECURITY;
ALTER TABLE pods DISABLE ROW LEVEL SECURITY;
ALTER TABLE pod_players DISABLE ROW LEVEL SECURITY;
ALTER TABLE matches DISABLE ROW LEVEL SECURITY;
ALTER TABLE playoff_teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE playoff_matches DISABLE ROW LEVEL SECURITY;

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

  -- Ensure publication exists
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END $$;

  -- Set tables for the publication (idempotent)
  ALTER PUBLICATION supabase_realtime SET TABLE 
    tournaments, 
    players, 
    rounds, 
    pods, 
    pod_players, 
    matches, 
    playoff_teams, 
    playoff_matches;
COMMIT;

-- Policies: Public Read, Authenticated/Service Role Write
DROP POLICY IF EXISTS "Public Read Access" ON tournaments;
CREATE POLICY "Public Read Access" ON tournaments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Access" ON players;
CREATE POLICY "Public Read Access" ON players FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Access" ON rounds;
CREATE POLICY "Public Read Access" ON rounds FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Access" ON pods;
CREATE POLICY "Public Read Access" ON pods FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Access" ON pod_players;
CREATE POLICY "Public Read Access" ON pod_players FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Access" ON matches;
CREATE POLICY "Public Read Access" ON matches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Access" ON playoff_teams;
CREATE POLICY "Public Read Access" ON playoff_teams FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Read Access" ON playoff_matches;
CREATE POLICY "Public Read Access" ON playoff_matches FOR SELECT USING (true);

-- Allow all for service role (implicit, but good to keep in mind)
-- For the app, we'll use the service role key on the backend to bypass RLS for setup/reset
