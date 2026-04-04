-- CourtOS Supabase Schema & RPC Engine
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLES
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'MINI', -- MINI, CORE, MAJOR
  status TEXT NOT NULL DEFAULT 'SETUP', -- SETUP, SEEDING, LADDER, TEAM_SELECTION, PLAYOFFS, FINISHED
  current_round_index INTEGER DEFAULT -1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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
  movement INTEGER DEFAULT 0, -- +1 = promoted, 0 = stayed, -1 = relegated
  CONSTRAINT unique_jersey_per_tournament UNIQUE (tournament_id, jersey_number)
);

ALTER TABLE players ADD COLUMN IF NOT EXISTS movement INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_rank INTEGER DEFAULT 0;

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
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, LOCKED
  pod_index INTEGER
);

ALTER TABLE pods ADD COLUMN IF NOT EXISTS pod_index INTEGER;

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
  v_num_pods INTEGER;
  v_court_names TEXT[] := ARRAY['Throne', 'Challenger', 'Contender', 'Survival'];
  v_player_ids UUID[];
  v_pod_id UUID;
  v_pod_players UUID[];
  v_court_index INTEGER;
  v_pod_name TEXT;
BEGIN
  SELECT mode INTO v_mode FROM tournaments WHERE id = p_tournament_id;
  
  v_num_pods := CASE 
    WHEN v_mode = 'MAJOR' THEN 8 
    WHEN v_mode = 'CORE' THEN 6 
    WHEN v_mode = 'MINI' THEN 4 
    WHEN v_mode = 'MICRO' THEN 3 
    ELSE 4 
  END;
  
  -- Get players sorted by rank
  SELECT array_agg(id ORDER BY rank ASC) INTO v_player_ids FROM players WHERE tournament_id = p_tournament_id;
  
  FOR i IN 0..(v_num_pods - 1) LOOP
    v_court_index := (i / 2) + 1;
    v_pod_name := CASE WHEN i % 2 = 0 THEN 'A' ELSE 'B' END;
    
    INSERT INTO pods (round_id, tournament_id, court_name, pod_name, pod_index)
    VALUES (p_round_id, p_tournament_id, v_court_names[v_court_index], v_pod_name, i + 1)
    RETURNING id INTO v_pod_id;
    
    v_pod_players := v_player_ids[(i*4 + 1):(i*4 + 4)];
    
    INSERT INTO pod_players (pod_id, player_id)
    SELECT v_pod_id, unnest(v_pod_players);
    
    -- Matches for Pod (Americano: 1+2 vs 3+4, 1+3 vs 2+4, 1+4 vs 2+3)
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
    IF (v_match->>'score1')::INT = 0 AND (v_match->>'score2')::INT = 0 THEN
      RAISE EXCEPTION 'Invalid match: 0-0 not allowed';
    END IF;

    IF (v_match->>'score1')::INT < 0 OR (v_match->>'score2')::INT < 0 THEN
      RAISE EXCEPTION 'Negative score not allowed';
    END IF;

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

    -- 4. STRICT LADDER STEP-LADDER SYSTEM
    CREATE TEMP TABLE temp_movement AS
    WITH ordered_pods AS (
      SELECT 
        p.id as pod_id,
        COALESCE(p.pod_index, row_number() OVER (ORDER BY 
          CASE p.court_name
            WHEN 'Throne' THEN 1
            WHEN 'Challenger' THEN 2
            WHEN 'Contender' THEN 3
            WHEN 'Survival' THEN 4
            ELSE 5
          END, 
          p.pod_name
        )) as pod_index
      FROM pods p
      WHERE p.round_id = v_round_id
    ),
    pod_results AS (
      SELECT 
        pp.player_id,
        pp.pod_rank,
        op.pod_id,
        op.pod_index,
        (SELECT MAX(pod_index) FROM ordered_pods) as max_pod
      FROM pod_players pp
      JOIN ordered_pods op ON pp.pod_id = op.pod_id
    ),
    movement AS (
      SELECT 
        pr.player_id,
        pr.pod_rank,
        pr.pod_index as old_pod_index,
        pr.max_pod,
        trs.pts,
        trs.diff,
        trs.scored,
        CASE
          WHEN pr.pod_index = 1 AND pr.pod_rank <= 2 THEN 1
          WHEN pr.pod_index = 1 AND pr.pod_rank > 2 THEN 2

          WHEN pr.pod_index = pr.max_pod AND pr.pod_rank <= 2 THEN pr.max_pod - 1
          WHEN pr.pod_index = pr.max_pod AND pr.pod_rank > 2 THEN pr.max_pod

          WHEN pr.pod_rank = 1 THEN pr.pod_index - 1
          WHEN pr.pod_rank = 2 THEN pr.pod_index
          WHEN pr.pod_rank = 3 THEN pr.pod_index
          WHEN pr.pod_rank = 4 THEN pr.pod_index + 1
        END as new_pod_index
      FROM pod_results pr
      JOIN temp_round_stats trs ON trs.player_id = pr.player_id AND trs.pod_id = pr.pod_id
    ),
    final_rank AS (
      SELECT 
        player_id,
        old_pod_index,
        new_pod_index,
        ROW_NUMBER() OVER (
          ORDER BY 
            new_pod_index,
            pts DESC,
            diff DESC,
            scored DESC,
            pod_rank,
            player_id
        ) as new_rank
      FROM movement
    )
    SELECT player_id, new_rank, old_pod_index, new_pod_index FROM final_rank;

    -- Apply ranks and movement
    UPDATE players p
    SET last_rank = p.rank,
        rank = tm.new_rank,
        movement = tm.old_pod_index - tm.new_pod_index
    FROM temp_movement tm
    WHERE p.id = tm.player_id;

    DROP TABLE temp_movement;
    DROP TABLE temp_round_stats;

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
        UPDATE tournaments SET status = 'TEAM_SELECTION' WHERE id = v_tournament_id;
      END IF;
    END IF;
  END IF;

  RETURN get_tournament_state(v_tournament_id);
END;
$$ LANGUAGE plpgsql;

-- 6. RPC: CREATE PLAYOFF TEAM (DRAFT)
DROP FUNCTION IF EXISTS create_playoff_team(UUID, UUID, UUID);
CREATE OR REPLACE FUNCTION create_playoff_team(p_tournament_id UUID, p_captain_id UUID, p_partner_id UUID)
RETURNS JSONB 
SECURITY DEFINER
AS $$
DECLARE
  v_captain_name TEXT;
  v_partner_name TEXT;
  v_captain_rank INTEGER;
  v_partner_rank INTEGER;
BEGIN
  -- Validation
  SELECT name, rank INTO v_captain_name, v_captain_rank FROM players WHERE id = p_captain_id;
  SELECT name, rank INTO v_partner_name, v_partner_rank FROM players WHERE id = p_partner_id;
  
  IF v_captain_rank > 4 THEN
    RAISE EXCEPTION 'Only top 4 players can be captains';
  END IF;
  
  IF v_partner_rank < 5 OR v_partner_rank > 8 THEN
    RAISE EXCEPTION 'Only players ranked 5-8 can be drafted as partners';
  END IF;
  
  IF EXISTS (SELECT 1 FROM playoff_teams WHERE tournament_id = p_tournament_id AND (captain_id = p_captain_id OR partner_id = p_captain_id OR captain_id = p_partner_id OR partner_id = p_partner_id)) THEN
    RAISE EXCEPTION 'One or both players are already in a team';
  END IF;

  INSERT INTO playoff_teams (tournament_id, captain_id, partner_id, name)
  VALUES (p_tournament_id, p_captain_id, p_partner_id, v_captain_name || ' / ' || v_partner_name);

  RETURN get_tournament_state(p_tournament_id);
END;
$$ LANGUAGE plpgsql;

-- 7. RPC: FINALIZE PLAYOFFS (GENERATE BRACKET)
DROP FUNCTION IF EXISTS finalize_playoffs(UUID);
CREATE OR REPLACE FUNCTION finalize_playoffs(p_tournament_id UUID)
RETURNS JSONB 
SECURITY DEFINER
AS $$
DECLARE
  v_team_ids UUID[];
  v_count INTEGER;
BEGIN
  -- Get teams ordered by captain rank
  SELECT array_agg(pt.id ORDER BY p.rank ASC) 
  INTO v_team_ids 
  FROM playoff_teams pt
  JOIN players p ON pt.captain_id = p.id
  WHERE pt.tournament_id = p_tournament_id;
  
  v_count := array_length(v_team_ids, 1);
  
  IF v_count < 4 THEN
    RAISE EXCEPTION 'Cannot finalize playoffs: only % teams drafted, need 4', v_count;
  END IF;

  -- Clear existing matches if any
  DELETE FROM playoff_matches WHERE tournament_id = p_tournament_id;

  -- Semis: 1 vs 4, 2 vs 3
  INSERT INTO playoff_matches (tournament_id, team1_id, team2_id, stage, status) VALUES
  (p_tournament_id, v_team_ids[1], v_team_ids[4], 'SEMIS', 'PENDING'),
  (p_tournament_id, v_team_ids[2], v_team_ids[3], 'SEMIS', 'PENDING');

  -- Final (TBD)
  INSERT INTO playoff_matches (tournament_id, team1_id, team2_id, stage, status) VALUES
  (p_tournament_id, NULL, NULL, 'FINALS', 'LOCKED');

  -- Update status
  UPDATE tournaments SET status = 'PLAYOFFS' WHERE id = p_tournament_id;

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
    'mode', COALESCE(t.mode, 'MINI'),
    'status', COALESCE(t.status, 'SETUP'),
    'currentRoundIndex', COALESCE(t.current_round_index, -1),
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
        'movement', p.movement
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
          )) FROM (
            SELECT * FROM pods 
            WHERE round_id = r.id
            ORDER BY COALESCE(pod_index, 0) ASC, pod_name ASC
          ) pd
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
  
  IF v_status = 'SEEDING' THEN
    UPDATE tournaments SET status = 'LADDER', current_round_index = 1 WHERE id = p_tournament_id;
    INSERT INTO rounds (tournament_id, number, type) VALUES (p_tournament_id, 2, 'LADDER') RETURNING id INTO v_round_id;
    PERFORM generate_round_pods(p_tournament_id, v_round_id);
  ELSIF v_status = 'LADDER' THEN
    IF v_round_idx < 3 THEN
      UPDATE tournaments SET current_round_index = v_round_idx + 1 WHERE id = p_tournament_id;
      INSERT INTO rounds (tournament_id, number, type) VALUES (p_tournament_id, v_round_idx + 2, 'LADDER') RETURNING id INTO v_round_id;
      PERFORM generate_round_pods(p_tournament_id, v_round_id);
    ELSE
      UPDATE tournaments SET status = 'TEAM_SELECTION' WHERE id = p_tournament_id;
    END IF;
  ELSIF v_status = 'TEAM_SELECTION' THEN
    PERFORM finalize_playoffs(p_tournament_id);
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
BEGIN;
  ALTER TABLE tournaments REPLICA IDENTITY FULL;
  ALTER TABLE players REPLICA IDENTITY FULL;
  ALTER TABLE rounds REPLICA IDENTITY FULL;
  ALTER TABLE pods REPLICA IDENTITY FULL;
  ALTER TABLE matches REPLICA IDENTITY FULL;
  ALTER TABLE playoff_teams REPLICA IDENTITY FULL;
  ALTER TABLE playoff_matches REPLICA IDENTITY FULL;

  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END $$;

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
