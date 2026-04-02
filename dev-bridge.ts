import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

// Global error handler for WebSocket rejections
process.on('unhandledRejection', (reason) => {
  if (reason instanceof Error && (reason.message.includes('WebSocket') || reason.message.includes('closed without opened'))) {
    return;
  }
  console.error('Unhandled Rejection:', reason);
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Supabase Admin Client (Bypasses RLS)
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  // Diagnostic Route
  app.get('/api/admin/db-check', async (req, res) => {
    try {
      const { data: t, error: te } = await supabaseAdmin.from('tournaments').select('id', { count: 'exact' });
      const { data: p, error: pe } = await supabaseAdmin.from('players').select('id', { count: 'exact' });
      res.json({ 
        connected: true, 
        tournaments: t, 
        players: p,
        errors: { te, pe }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Read Routes (Bypass RLS)
  app.get('/api/admin/tournaments', async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('tournaments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/tournament/:id', async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[Bridge] Fetching tournament data for ID: ${id}`);
      const { data: tournament, error: tError } = await supabaseAdmin
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (tError) {
        console.error('[Bridge] Tournament fetch error:', tError);
        throw tError;
      }
      if (!tournament) {
        console.warn(`[Bridge] Tournament not found: ${id}`);
        return res.status(404).json({ error: 'Not found' });
      }

      console.log(`[Bridge] Tournament found: ${tournament.name}, fetching related data...`);

      const [
        { data: players, error: pError },
        { data: matches, error: mError },
        { data: playoffTeams, error: ptError },
        { data: playoffMatches, error: pmError }
      ] = await Promise.all([
        supabaseAdmin.from('players').select('*').eq('tournament_id', id).order('rank', { ascending: true }),
        supabaseAdmin.from('matches').select('*').eq('tournament_id', id).order('round', { ascending: true }),
        supabaseAdmin.from('playoff_teams').select('*').eq('tournament_id', id),
        supabaseAdmin.from('playoff_matches').select('*').eq('tournament_id', id)
      ]);

      if (pError) console.error('[Bridge] Players fetch error:', pError);
      if (mError) console.error('[Bridge] Matches fetch error:', mError);
      if (ptError) console.error('[Bridge] Playoff teams fetch error:', ptError);
      if (pmError) console.error('[Bridge] Playoff matches fetch error:', pmError);

      console.log(`[Bridge] Data fetched: ${players?.length || 0} players, ${matches?.length || 0} matches`);

      res.json({
        tournament,
        players: players || [],
        matches: matches || [],
        playoffTeams: playoffTeams || [],
        playoffMatches: playoffMatches || []
      });
    } catch (err: any) {
      console.error('[Bridge] Fatal error in /api/admin/tournament/:id:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Routes for Administrative Tasks
  app.post('/api/admin/setup', async (req, res) => {
    try {
      const { name, mode, players } = req.body;
      console.log(`[Admin] Setting up tournament: ${name} (${mode}) with ${players.length} players`);
      
      // 1. Create tournament
      const { data: tData, error: tError } = await supabaseAdmin
        .from('tournaments')
        .insert([{ name, mode, status: 'SETUP', current_round_index: 0 }])
        .select()
        .single();
      
      if (tError) {
        console.error('[Admin] Tournament Insert Error:', tError);
        throw tError;
      }

      console.log(`[Admin] Tournament created with ID: ${tData.id}`);

      // 2. Create players
      const playersToInsert = players.map((p: any) => ({
        id: p.id, // Use the ID from the frontend
        name: p.name,
        phone: p.phone,
        email: p.email,
        dupr_id: p.duprId,
        jersey_number: p.jerseyNumber,
        avatar_url: p.avatarUrl,
        tournament_id: tData.id,
        rank: 0,
        points: 0,
        point_diff: 0,
        points_scored: 0,
        pod_wins: 0
      }));

      const { error: pError } = await supabaseAdmin
        .from('players')
        .insert(playersToInsert);
      
      if (pError) {
        console.error('[Admin] Players Insert Error:', pError);
        throw pError;
      }

      console.log(`[Admin] ${playersToInsert.length} players inserted successfully`);
      res.json({ id: tData.id });
    } catch (err: any) {
      console.error('[Admin] Setup Route Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/start-seeding', async (req, res) => {
    try {
      const { tournamentId } = req.body;
      
      const { data: players, error: pError } = await supabaseAdmin
        .from('players')
        .select('*')
        .eq('tournament_id', tournamentId);
      if (pError) throw pError;

      const shuffled = [...players].sort(() => Math.random() - 0.5);
      const matches: any[] = [];
      
      for (let i = 0; i < shuffled.length; i += 4) {
        const podPlayers = shuffled.slice(i, i + 4);
        if (podPlayers.length < 4) break;

        const podId = uuidv4();
        const podName = String.fromCharCode(65 + (i / 4));
        const matchTemplates = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]];

        matchTemplates.forEach((indices, idx) => {
          matches.push({
            id: uuidv4(),
            tournament_id: tournamentId,
            player_ids: indices.map(idx => podPlayers[idx].id),
            score1: 0,
            score2: 0,
            status: 'PENDING',
            round: 0,
            pod_id: podId,
            pod_name: podName,
            match_index: idx
          });
        });
      }

      if (matches.length > 0) {
        const { error: mError } = await supabaseAdmin.from('matches').insert(matches);
        if (mError) throw mError;
      }

      await supabaseAdmin.from('tournaments').update({ status: 'SEEDING' }).eq('id', tournamentId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
