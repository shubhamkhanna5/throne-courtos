import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { Tournament } from './src/types';

dotenv.config();

// Global error handlers to prevent silent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let supabase: any = null;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
} catch (err) {
  console.error('Error initializing Supabase client:', err);
}

if (!supabase) {
  console.error('CRITICAL: Supabase environment variables are missing or invalid. Database features will not work.');
}

// Run migrations on startup
async function runMigrations() {
  if (!supabase) return;
  try {
    const { error } = await supabase.rpc('run_migrations');
    if (error) {
      console.warn('Migration RPC failed (this is normal if the function is not yet created):', error.message);
    } else {
      console.log('Database migrations completed successfully');
    }
  } catch (err) {
    console.warn('Error running migrations:', err);
  }
}

runMigrations();

let currentTournamentId: string | null = null;
let lastStateHash: string | null = null;

function hashState(data: any): string {
  return JSON.stringify(data);
}

async function fetchTournamentState(id: string): Promise<Tournament | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_tournament_state', { p_tournament_id: id });
  if (error) {
    console.error('Error fetching tournament state:', error.message, error.details, error.hint);
    return null;
  }
  return data as Tournament;
}

async function broadcastState(io: Server, id: string) {
  const state = await fetchTournamentState(id);
  if (!state) return;

  const currentHash = hashState(state);
  if (currentHash !== lastStateHash) {
    io.emit('state_update', state);
    lastStateHash = currentHash;
  }
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });

  app.use(express.json());

  // Middleware to check if database is configured
  const checkDatabase = (req: any, res: any, next: any) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    next();
  };

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      tournamentId: currentTournamentId,
      supabaseConfigured: !!supabase
    });
  });

  // API Routes
  app.get('/api/tournaments', checkDatabase, async (req, res) => {
    try {
      const { data, error } = await supabase!
        .from('tournaments')
        .select('id, name, status, created_at')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/tournament/load', checkDatabase, async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing tournament ID' });
    
    currentTournamentId = id;
    const state = await fetchTournamentState(id);
    if (state) {
      io.emit('state_update', state);
      lastStateHash = hashState(state);
    }
    res.json(state);
  });

  app.get('/api/tournament', checkDatabase, async (req, res) => {
    try {
      if (!currentTournamentId) {
        // Try to find the latest tournament
        const { data, error } = await supabase!
          .from('tournaments')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          currentTournamentId = data[0].id;
        }
      }

      if (currentTournamentId) {
        const state = await fetchTournamentState(currentTournamentId);
        res.json(state);
      } else {
        res.json(null);
      }
    } catch (err: any) {
      console.error('Error in /api/tournament:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/tournament/setup', checkDatabase, async (req, res) => {
    try {
      const { name, mode, players } = req.body;
      if (!name || !mode || !Array.isArray(players)) {
        return res.status(400).json({ error: 'Missing required fields: name, mode, or players' });
      }
      console.log(`Setting up tournament: ${name}, mode: ${mode}, players: ${players?.length}`);
      
      const { data, error } = await supabase!.rpc('setup_tournament', {
        p_name: name,
        p_mode: mode,
        p_scoring_mode: 'RALLY', // Defaulting to RALLY in DB for now, or we can remove it from DB too
        p_players: players
      });

      if (error) {
        console.error('Setup RPC error:', JSON.stringify(error, null, 2));
        return res.status(500).json({ error: error.message });
      }
      
      currentTournamentId = data;
      console.log(`Tournament created with ID: ${currentTournamentId}`);
      await broadcastState(io, currentTournamentId!);
      res.json({ success: true, id: currentTournamentId });
    } catch (err: any) {
      console.error('Setup endpoint error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/tournament/start-seeding', checkDatabase, async (req, res) => {
    try {
      if (!currentTournamentId) {
        console.error('Start seeding failed: No currentTournamentId');
        return res.status(400).json({ error: 'No tournament' });
      }
      
      console.log(`Starting seeding for tournament: ${currentTournamentId}`);
      const { error } = await supabase!.rpc('start_seeding', { p_tournament_id: currentTournamentId });
      
      if (error) {
        console.error('Start seeding RPC error:', JSON.stringify(error, null, 2));
        return res.status(500).json({ error: error.message });
      }
      
      await broadcastState(io, currentTournamentId);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Start seeding endpoint error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/tournament/submit-pod', checkDatabase, async (req, res) => {
    const { podId, matches } = req.body;
    if (!currentTournamentId) return res.status(400).json({ error: 'No tournament' });
    
    const { error } = await supabase!.rpc('submit_pod', {
      p_pod_id: podId,
      p_matches: matches
    });

    if (error) {
      console.error('Submit pod RPC error:', JSON.stringify(error, null, 2));
      return res.status(500).json({ error: error.message });
    }
    
    const state = await fetchTournamentState(currentTournamentId);
    if (state) {
      const currentHash = hashState(state);
      if (currentHash !== lastStateHash) {
        io.emit('state_update', state);
        lastStateHash = currentHash;
      }
    }
    res.json(state);
  });

  app.post('/api/tournament/draft-partner', checkDatabase, async (req, res) => {
    const { captainId, partnerId } = req.body;
    if (!currentTournamentId) return res.status(400).json({ error: 'No tournament' });
    
    const { error } = await supabase!.rpc('draft_partner', {
      p_tournament_id: currentTournamentId,
      p_captain_id: captainId,
      p_partner_id: partnerId
    });
    
    if (error) {
      console.error('Draft partner RPC error:', JSON.stringify(error, null, 2));
      return res.status(500).json({ error: error.message });
    }
    
    const state = await fetchTournamentState(currentTournamentId);
    if (state) {
      const currentHash = hashState(state);
      if (currentHash !== lastStateHash) {
        io.emit('state_update', state);
        lastStateHash = currentHash;
      }
    }
    res.json(state);
  });
  
  app.post('/api/tournament/generate-playoffs', checkDatabase, async (req, res) => {
    if (!currentTournamentId) return res.status(400).json({ error: 'No tournament' });
    
    const { error } = await supabase!.rpc('generate_playoffs', { p_tournament_id: currentTournamentId });
    if (error) {
      console.error('Generate playoffs RPC error:', JSON.stringify(error, null, 2));
      return res.status(500).json({ error: error.message });
    }
    
    const state = await fetchTournamentState(currentTournamentId);
    if (state) {
      const currentHash = hashState(state);
      if (currentHash !== lastStateHash) {
        io.emit('state_update', state);
        lastStateHash = currentHash;
      }
    }
    res.json(state);
  });
  
  app.post('/api/tournament/submit-playoff-match', checkDatabase, async (req, res) => {
    const { matchId, score1, score2 } = req.body;
    if (!currentTournamentId) return res.status(400).json({ error: 'No tournament' });
    
    const { error } = await supabase!.rpc('submit_playoff_match', {
      p_match_id: matchId,
      p_score1: score1,
      p_score2: score2
    });
    
    if (error) {
      console.error('Submit playoff match RPC error:', JSON.stringify(error, null, 2));
      return res.status(500).json({ error: error.message });
    }
    
    const state = await fetchTournamentState(currentTournamentId);
    if (state) {
      const currentHash = hashState(state);
      if (currentHash !== lastStateHash) {
        io.emit('state_update', state);
        lastStateHash = currentHash;
      }
    }
    res.json(state);
  });

  app.post('/api/tournament/reset', checkDatabase, async (req, res) => {
    if (currentTournamentId) {
      await supabase!.from('tournaments').delete().eq('id', currentTournamentId);
      currentTournamentId = null;
    }
    io.emit('state_update', null);
    res.json({ success: true });
  });

  app.post('/api/tournament/delete', checkDatabase, async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing tournament ID' });
    
    const { error } = await supabase!.from('tournaments').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    
    if (currentTournamentId === id) {
      currentTournamentId = null;
      io.emit('state_update', null);
    }
    res.json({ success: true });
  });

  app.post('/api/tournament/clear-all', checkDatabase, async (req, res) => {
    const { error } = await supabase!.from('tournaments').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    if (error) return res.status(500).json({ error: error.message });
    
    currentTournamentId = null;
    io.emit('state_update', null);
    res.json({ success: true });
  });

  // Vite middleware
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

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });

  io.on('connection', async (socket) => {
    console.log('Client connected');
    try {
      if (currentTournamentId) {
        const state = await fetchTournamentState(currentTournamentId);
        socket.emit('state_update', state);
      } else {
        socket.emit('state_update', null);
      }
    } catch (err) {
      console.error('Error in socket connection initial sync:', err);
      socket.emit('error', 'Failed to fetch initial state');
    }

    socket.on('submit_score', async (payload) => {
      if (!currentTournamentId || !supabase) return;
      try {
        const { error } = await supabase.rpc('submit_pod', {
          p_pod_id: payload.podId,
          p_matches: payload.matches
        });
        if (error) throw error;
        await broadcastState(io, currentTournamentId);
      } catch (err: any) {
        socket.emit('error', err.message);
      }
    });

    socket.on('submit_playoff_score', async (payload) => {
      if (!currentTournamentId || !supabase) return;
      try {
        const { error } = await supabase.rpc('submit_playoff_match', {
          p_match_id: payload.matchId,
          p_score1: payload.score1,
          p_score2: payload.score2
        });
        if (error) throw error;
        await broadcastState(io, currentTournamentId);
      } catch (err: any) {
        socket.emit('error', err.message);
      }
    });

    socket.on('draft_partner', async (payload) => {
      if (!currentTournamentId || !supabase) return;
      try {
        const { data, error } = await supabase.rpc('draft_partner', {
          p_tournament_id: currentTournamentId,
          p_captain_id: payload.captainId,
          p_partner_id: payload.partnerId
        });

        if (error) throw error;

        // If draft complete, generate playoffs automatically
        const cutLine = 8;
        if (data.playoffTeams.length === cutLine / 2) {
          const { error: genError } = await supabase.rpc('generate_playoffs', { p_tournament_id: currentTournamentId });
          if (genError) throw genError;
        }
        
        await broadcastState(io, currentTournamentId);
      } catch (error) {
        console.error('Draft error:', error);
        socket.emit('error', { message: 'Failed to draft partner' });
      }
    });

    socket.on('generate_playoffs', async () => {
      if (!currentTournamentId || !supabase) return;
      try {
        const { error } = await supabase.rpc('generate_playoffs', { p_tournament_id: currentTournamentId });
        if (error) throw error;
        await broadcastState(io, currentTournamentId);
      } catch (error) {
        console.error('Generate playoffs error:', error);
        socket.emit('error', { message: 'Failed to generate playoffs' });
      }
    });

    socket.on('force_sync', async () => {
      if (currentTournamentId) {
        await broadcastState(io, currentTournamentId);
      }
    });
  });
}

startServer();
