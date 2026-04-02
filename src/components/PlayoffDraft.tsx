import { useState, useEffect } from 'react';
import { Tournament, Player, PlayoffTeam } from '../types';
import { tournamentService } from '../lib/tournamentService';
import { Trophy, Users, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import TournamentBracket from './TournamentBracket';

interface PlayoffDraftProps {
  tournament: Tournament;
}

export default function PlayoffDraft({ tournament }: PlayoffDraftProps) {
  const [isLoading, setIsLoading] = useState(false);
  const cutLine = 8;
  const sortedPlayers = [...tournament.players].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    return b.pointsScored - a.pointsScored;
  });
  const qualifiers = sortedPlayers.slice(0, cutLine);
  
  const captains = qualifiers.slice(0, cutLine / 2);
  const pool = qualifiers.slice(cutLine / 2);

  const currentCaptainIdx = (tournament.playoffTeams || []).length;
  const currentCaptain = captains[currentCaptainIdx];

  const hasMatches = (tournament.playoffMatches || []).length > 0;
  const isDraftComplete = currentCaptainIdx >= captains.length && !hasMatches;

  useEffect(() => {
    setIsLoading(false);
  }, [tournament]);

  const handlePick = async (playerId: string) => {
    if (isLoading || !tournament) return;
    setIsLoading(true);
    try {
      await tournamentService.draftPartner(tournament.id, currentCaptain.id, playerId);
      setTimeout(() => {
        window.location.href = window.location.href;
      }, 5000);
    } catch (err) {
      console.error('Draft partner error:', err);
      alert('Failed to draft partner. Please try again.');
      setIsLoading(false);
    }
  };

  const handleFinalizeDraft = async () => {
    if (isLoading || !tournament) return;
    setIsLoading(true);
    try {
      await tournamentService.advanceRound(tournament.id);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      console.error('Finalize draft error:', err);
      alert(err instanceof Error ? err.message : 'Failed to finalize draft. Please try again.');
      setIsLoading(false);
    }
  };

  if (hasMatches) {
    return (
      <div className="max-w-6xl mx-auto space-y-12 py-12">
        <div className="text-center space-y-4">
          <h2 className="text-6xl font-display italic font-black uppercase tracking-tighter text-primary">CHAMPIONSHIP BRACKET</h2>
          <div className="text-xs font-mono font-bold uppercase tracking-[0.3em] text-tertiary">THE ROAD TO THE THRONE</div>
        </div>

        <TournamentBracket tournament={tournament} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      <div className="text-center space-y-4">
        <h2 className="text-6xl font-display italic font-black uppercase tracking-tighter text-primary">THE DRAFT</h2>
        <div className="text-xs font-mono font-bold uppercase tracking-[0.3em] text-tertiary">PLAYOFF QUALIFICATION COMPLETE</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Teams Status */}
        <div className="space-y-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-tertiary">Playoff Teams</h3>
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {captains.map((captain, idx) => {
                const team = (tournament.playoffTeams || []).find(t => t.captainId === captain.id);
                const partner = (tournament.players || []).find(p => p.id === team?.partnerId);
                const isActive = idx === currentCaptainIdx;

                return (
                  <motion.div 
                    key={captain.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ 
                      opacity: 1, 
                      x: 0,
                      scale: isActive ? 1.05 : 1,
                    }}
                    className={`p-6 rounded-2xl border-2 transition-all ${
                      isActive ? 'border-outline bg-surface shadow-xl' : 'border-transparent bg-surface-variant'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary">TEAM {idx + 1}</span>
                      {isActive && <div className="text-[10px] bg-primary text-surface px-2 py-0.5 rounded animate-pulse">PICKING...</div>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <div className="text-[8px] font-bold uppercase text-tertiary">CAPTAIN</div>
                        <div className="text-lg font-bold truncate text-primary">{captain.name}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[8px] font-bold uppercase text-tertiary">PARTNER</div>
                        <AnimatePresence mode="wait">
                          <motion.div 
                            key={partner?.id || 'pending'}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="text-lg font-bold truncate text-primary"
                          >
                            {partner ? partner.name : <span className="text-tertiary italic">PENDING</span>}
                          </motion.div>
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Available Pool */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold uppercase tracking-widest text-tertiary">Available Pool</h3>
            {isDraftComplete && (
              <button
                onClick={handleFinalizeDraft}
                disabled={isLoading}
                className="px-4 py-2 bg-primary text-surface rounded-lg font-black uppercase tracking-widest text-[10px] hover:bg-primary-dim shadow-lg transition-all flex items-center gap-2"
              >
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Finalize Draft
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2">
            <AnimatePresence mode="popLayout">
              {pool.map((player) => {
                const isPicked = (tournament.playoffTeams || []).some(t => t.partnerId === player.id);
                
                return (
                  <motion.button
                    key={player.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    disabled={isPicked || currentCaptainIdx >= captains.length}
                    onClick={() => handlePick(player.id)}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                      isPicked ? 'opacity-20 border-transparent' : 'border-white/10 bg-black text-white hover:bg-black/80'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-xl font-display italic font-bold">#{sortedPlayers.findIndex(p => p.id === player.id) + 1}</span>
                      <span className="text-lg font-bold uppercase tracking-tight">{player.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold">{player.points} PTS</div>
                      <div className="text-[8px] font-mono text-white/40 uppercase">DIFF {player.pointDiff}</div>
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
