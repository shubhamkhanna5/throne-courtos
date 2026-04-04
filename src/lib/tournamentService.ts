import { supabase } from './supabase';
import { Tournament, Player, Match, PlayoffTeam, PlayoffMatch } from '../types';

export const tournamentService = {
  async getTournaments() {
    try {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (err: any) {
      console.error('[TournamentService] getTournaments error:', err.message || err);
      return [];
    }
  },

  async getTournament(id?: string) {
    let tId = id;
    console.log('[TournamentService] getTournament called with id:', tId);

    try {
      if (!supabase) return null;

      if (!tId) {
        const tournaments = await this.getTournaments();
        if (!tournaments || tournaments.length === 0) {
          console.log('[TournamentService] No tournaments found');
          return null;
        }
        tId = tournaments[0].id;
        console.log('[TournamentService] Using latest tournament id:', tId);
      }

      const { data, error } = await supabase.rpc('get_tournament_state', { 
        p_tournament_id: tId 
      });

      if (error) {
        if (error.message?.includes('Invalid API key')) {
          console.error('[TournamentService] Supabase authentication failed. Please check your VITE_SUPABASE_ANON_KEY and VITE_SUPABASE_URL in the Settings menu.');
        }
        if (error.code === 'PGRST116' || error.message?.includes('not found')) {
          console.warn('[TournamentService] Tournament not found, clearing stored ID');
          localStorage.removeItem('courtos_current_tournament_id');
          return null;
        }
        throw error;
      }

      console.log('[TournamentService] Received tournament data:', data);
      return data;
    } catch (err: any) {
      console.error('[TournamentService] getTournament fatal error:', err.message || err);
      return null;
    }
  },

  async setupTournament(name: string, mode: string, players: Partial<Player>[]) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('setup_tournament', {
      p_name: name,
      p_mode: mode,
      p_players: players.map(p => ({
        name: p.name,
        contact: p.contact || p.phone || p.email || '',
        duprId: p.duprId || '',
        jerseyNumber: p.jerseyNumber || ''
      }))
    });

    if (error) {
      console.error('[TournamentService] setupTournament error:', error);
      throw new Error(error.message || 'Setup failed');
    }
    return data;
  },

  async startSeeding(tournamentId: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { error } = await supabase.rpc('start_seeding', {
      p_tournament_id: tournamentId
    });

    if (error) {
      console.error('[TournamentService] startSeeding error:', error);
      throw new Error(error.message || 'Seeding failed');
    }
  },

  async advanceRound(tournamentId: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('advance_tournament', {
      p_tournament_id: tournamentId
    });

    if (error) {
      console.error('[TournamentService] advanceRound error:', error);
      throw new Error(error.message || 'Round advancement failed');
    }
    return data;
  },

  async submitScore(podId: string, matches: any[], tournamentId: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('submit_pod', {
      p_pod_id: podId,
      p_matches: matches
    });

    if (error) {
      console.error('[TournamentService] submitScore error:', error);
      throw new Error(error.message || 'Failed to submit scores');
    }
    return data;
  },

  async submitPlayoffScore(matchId: string, score1: number, score2: number) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('submit_playoff_score', {
      p_match_id: matchId,
      p_score1: score1,
      p_score2: score2
    });

    if (error) {
      console.error('[TournamentService] submitPlayoffScore error:', error);
      throw new Error(error.message || 'Failed to submit playoff score');
    }
    return data;
  },

  async createPlayoffTeam(tournamentId: string, captainId: string, partnerId: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('create_playoff_team', {
      p_tournament_id: tournamentId,
      p_captain_id: captainId,
      p_partner_id: partnerId
    });

    if (error) {
      console.error('[TournamentService] createPlayoffTeam error:', error);
      throw new Error(error.message || 'Drafting failed');
    }
    return data;
  },

  async finalizePlayoffs(tournamentId: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('finalize_playoffs', {
      p_tournament_id: tournamentId
    });

    if (error) {
      console.error('[TournamentService] finalizePlayoffs error:', error);
      throw new Error(error.message || 'Finalization failed');
    }
    return data;
  },

  async resetTournament(id: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('reset_tournament', {
      p_tournament_id: id
    });

    if (error) {
      console.error('[TournamentService] resetTournament error:', error);
      throw new Error(error.message || 'Reset failed');
    }
    return data;
  },

  async finishTournament(id: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase.rpc('finish_tournament', {
      p_tournament_id: id
    });

    if (error) {
      console.error('[TournamentService] finishTournament error:', error);
      throw new Error(error.message || 'Finish failed');
    }
    return data;
  },

  async deleteTournament(id: string) {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { error } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[TournamentService] deleteTournament error:', error);
      throw new Error(error.message || 'Delete failed');
    }
    return { success: true };
  }
};
