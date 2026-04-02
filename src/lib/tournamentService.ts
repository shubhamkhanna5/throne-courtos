import { supabase } from './supabase';
import { Tournament, Player, Match, PlayoffTeam, PlayoffMatch } from '../types';

export const tournamentService = {
  async getTournaments() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const res = await fetch('/api/admin/tournaments', { signal: controller.signal });
      clearTimeout(timeoutId);
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch tournaments');
      return data;
    } catch (err) {
      console.error('[TournamentService] getTournaments error:', err);
      return [];
    }
  },

  async getTournament(id?: string) {
    let tId = id;
    console.log('[TournamentService] getTournament called with id:', tId);
    try {
      if (!tId) {
        const tournaments = await this.getTournaments();
        if (!tournaments || tournaments.length === 0) {
          console.log('[TournamentService] No tournaments found');
          return null;
        }
        tId = tournaments[0].id;
        console.log('[TournamentService] Using latest tournament id:', tId);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(`/api/admin/tournament/${tId}`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        if (res.status === 404) {
          console.warn('[TournamentService] Tournament not found (404), clearing stored ID');
          localStorage.removeItem('courtos_current_tournament_id');
          return null;
        }
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[TournamentService] API error:', res.status, errorData);
        throw new Error(errorData.error || `Failed to fetch tournament: ${res.status}`);
      }

      const data = await res.json();
      console.log('[TournamentService] Received tournament data:', data);

      const { tournament: tournamentData, players, matches, playoffTeams, playoffMatches } = data;

      if (!tournamentData) {
        console.error('[TournamentService] Missing tournament object in response');
        throw new Error('Invalid tournament data received');
      }

    // Group matches into rounds and pods
    const roundsMap = new Map<number, any>();
    
    matches?.forEach((m: any) => {
      if (m.round === undefined || m.round === null) {
        console.warn('[TournamentService] Match missing round:', m.id);
        return;
      }

      if (!roundsMap.has(m.round)) {
        roundsMap.set(m.round, {
          id: `round-${m.round}`,
          number: m.round + 1,
          type: m.round === 0 ? 'SEEDING' : 'LADDER',
          pods: [],
          status: 'PENDING'
        });
      }
      
      const round = roundsMap.get(m.round);
      if (!m.pod_id) {
        console.warn('[TournamentService] Match missing pod_id:', m.id);
        return;
      }

      let pod = round.pods.find((p: any) => p.id === m.pod_id);
      
      if (!pod) {
        pod = {
          id: m.pod_id,
          podName: m.pod_name || '?',
          courtName: m.pod_name ? `Court ${m.pod_name}` : 'Unknown Court',
          playerIds: m.player_ids || [],
          matches: [],
          status: 'PENDING'
        };
        round.pods.push(pod);
      }
      
      pod.matches.push({
        id: m.id,
        playerIds: m.player_ids || [],
        score1: m.score1 || 0,
        score2: m.score2 || 0,
        status: m.status || 'PENDING'
      });
    });

    // Determine pod status based on matches
    roundsMap.forEach(round => {
      round.pods.forEach((pod: any) => {
        const allLocked = pod.matches.length > 0 && pod.matches.every((m: any) => m.status === 'LOCKED');
        if (allLocked) pod.status = 'LOCKED';
      });
    });

    const rounds = Array.from(roundsMap.values()).sort((a, b) => a.number - b.number);

    const result = {
      id: tournamentData.id,
      name: tournamentData.name,
      mode: tournamentData.mode,
      status: tournamentData.status,
      currentRoundIndex: tournamentData.current_round_index || 0,
      players: players?.map((p: any) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        duprId: p.dupr_id,
        jerseyNumber: p.jersey_number,
        rank: p.rank,
        points: p.points,
        pointDiff: p.point_diff,
        pointsScored: p.points_scored,
        podWins: p.pod_wins,
        avatarUrl: p.avatar_url,
        lastRank: p.last_rank
      })) || [],
      rounds: rounds,
      playoffTeams: playoffTeams?.map((t: any) => ({
        id: t.id,
        captainId: t.captain_id,
        partnerId: t.partner_id,
        name: t.name
      })) || [],
      playoffMatches: playoffMatches?.map((m: any) => ({
        id: m.id,
        team1Id: m.team1_id,
        team2Id: m.team2_id,
        score1: m.score1,
        score2: m.score2,
        status: m.status,
        stage: m.stage
      })) || []
    };

    console.log('[TournamentService] Successfully mapped tournament:', result.id);
    return result;
    } catch (err) {
      console.error('[TournamentService] getTournament fatal error:', err);
      // Don't clear ID on every error, only on 404
      // localStorage.removeItem('courtos_current_tournament_id');
      return null;
    }
  },

  async setupTournament(name: string, mode: string, players: Partial<Player>[]) {
    const res = await fetch('/api/admin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mode, players })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Setup failed');
    return data.id;
  },

  async startSeeding(tournamentId: string) {
    const res = await fetch('/api/admin/start-seeding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Seeding failed');
  },

  async submitScore(podId: string, matches: any[]) {
    for (const match of matches) {
      const { error } = await supabase
        .from('matches')
        .update({
          score1: match.score1,
          score2: match.score2,
          status: 'LOCKED'
        })
        .eq('id', match.id);
      if (error) throw error;
    }
    // Note: Ranking logic could be added here or via Supabase RPC
  },

  async submitPlayoffScore(matchId: string, score1: number, score2: number) {
    const { data: match, error: mError } = await supabase
      .from('playoff_matches')
      .update({ score1, score2, status: 'LOCKED' })
      .eq('id', matchId)
      .select()
      .single();
    if (mError) throw mError;

    if (match.stage === 'FINALS') {
      await supabase.from('tournaments').update({ status: 'FINISHED' }).eq('id', match.tournament_id);
    }
  },

  async draftPartner(tournamentId: string, captainId: string, partnerId: string) {
    const { data: captain } = await supabase.from('players').select('name').eq('id', captainId).single();
    const { data: partner } = await supabase.from('players').select('name').eq('id', partnerId).single();
    
    const { error } = await supabase.from('playoff_teams').insert([{
      tournament_id: tournamentId,
      captain_id: captainId,
      partner_id: partnerId,
      name: `${captain?.name} / ${partner?.name}`
    }]);
    if (error) throw error;
  },

  async resetTournament(id: string) {
    await supabase.from('matches').delete().eq('tournament_id', id);
    await supabase.from('playoff_matches').delete().eq('tournament_id', id);
    await supabase.from('playoff_teams').delete().eq('tournament_id', id);
    await supabase.from('tournaments').update({ status: 'SETUP', current_round_index: 0 }).eq('id', id);
    await supabase.from('players').update({ points: 0, point_diff: 0, points_scored: 0, pod_wins: 0, rank: 0 }).eq('tournament_id', id);
  },

  async deleteTournament(id: string) {
    const { error } = await supabase.from('tournaments').delete().eq('id', id);
    if (error) throw error;
  }
};
