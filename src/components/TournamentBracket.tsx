import { Tournament, Match, PlayoffTeam } from '../types';
import { Trophy } from 'lucide-react';
import { motion } from 'motion/react';

interface TournamentBracketProps {
  tournament: Tournament;
}

export default function TournamentBracket({ tournament }: TournamentBracketProps) {
  const semis = (tournament.playoffMatches || []).filter(m => m.stage === 'SEMIS');
  const finals = (tournament.playoffMatches || []).find(m => m.stage === 'FINALS');

  const getTeam = (teamId: string | null) => {
    return (tournament.playoffTeams || []).find(t => t.id === teamId);
  };

  return (
    <div className="w-full overflow-x-auto py-12">
      <div className="min-w-[800px] flex items-center justify-center gap-12">
        {/* Semifinals */}
        <div className="flex flex-col gap-16">
          {semis.map((match, idx) => {
            const t1 = getTeam(match.team1Id);
            const t2 = getTeam(match.team2Id);
            const isLocked = match.status === 'LOCKED';
            const winnerId = isLocked ? (match.score1 > match.score2 ? match.team1Id : match.team2Id) : null;

            return (
              <motion.div 
                key={match.id} 
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.2 }}
                className="relative flex items-center"
              >
                <div className="w-64 bg-surface border-2 border-outline rounded-xl overflow-hidden shadow-md">
                  <div className={`p-3 flex justify-between items-center border-b border-outline/30 ${winnerId === match.team1Id ? 'bg-primary/10' : ''}`}>
                    <span className={`text-sm font-bold truncate ${winnerId === match.team1Id ? 'text-primary' : 'text-on-surface'}`}>
                      {t1?.name || 'TBD'}
                    </span>
                    <span className="font-mono font-black">{match.score1}</span>
                  </div>
                  <div className={`p-3 flex justify-between items-center ${winnerId === match.team2Id ? 'bg-primary/10' : ''}`}>
                    <span className={`text-sm font-bold truncate ${winnerId === match.team2Id ? 'text-primary' : 'text-on-surface'}`}>
                      {t2?.name || 'TBD'}
                    </span>
                    <span className="font-mono font-black">{match.score2}</span>
                  </div>
                </div>
                {/* Connector to Finals */}
                <motion.div 
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.5 + idx * 0.2 }}
                  className="absolute -right-12 w-12 h-[2px] bg-outline-variant origin-left"
                ></motion.div>
                {idx === 0 ? (
                  <motion.div 
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.7 + idx * 0.2 }}
                    className="absolute -right-12 top-1/2 w-[2px] h-[82px] bg-outline-variant origin-top"
                  ></motion.div>
                ) : (
                  <motion.div 
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.7 + idx * 0.2 }}
                    className="absolute -right-12 bottom-1/2 w-[2px] h-[82px] bg-outline-variant origin-bottom"
                  ></motion.div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Finals */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1 }}
          className="relative flex items-center"
        >
          <div className="absolute -left-12 w-12 h-[2px] bg-outline-variant"></div>
          <div className="w-72 bg-primary p-1 rounded-2xl shadow-2xl">
            <div className="bg-surface rounded-[14px] border border-primary/20 overflow-hidden">
              <div className="p-4 bg-primary/5 text-center border-b border-outline/20">
                <Trophy className="w-6 h-6 mx-auto mb-1 text-primary" />
                <div className="text-[8px] font-black uppercase tracking-widest text-primary/60">Finals</div>
              </div>
              {finals ? (
                <>
                  <div className={`p-4 flex justify-between items-center border-b border-outline/30 ${finals.status === 'LOCKED' && finals.score1 > finals.score2 ? 'bg-primary/10' : ''}`}>
                    <span className="font-display italic font-black uppercase text-primary">
                      {getTeam(finals.team1Id)?.name || 'TBD'}
                    </span>
                    <span className="text-2xl font-mono font-black">{finals.score1}</span>
                  </div>
                  <div className={`p-4 flex justify-between items-center ${finals.status === 'LOCKED' && finals.score2 > finals.score1 ? 'bg-primary/10' : ''}`}>
                    <span className="font-display italic font-black uppercase text-primary">
                      {getTeam(finals.team2Id)?.name || 'TBD'}
                    </span>
                    <span className="text-2xl font-mono font-black">{finals.score2}</span>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-on-surface-variant italic text-xs">
                  Awaiting Semifinals
                </div>
              )}
            </div>
          </div>
          
          {/* Champion Display */}
          {finals?.status === 'LOCKED' && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.5, duration: 1 }}
              className="absolute -right-48 w-40 text-center"
            >
              <div className="text-[8px] font-black uppercase tracking-[0.3em] text-primary mb-1">Champion</div>
              <div className="text-2xl font-display italic font-black uppercase text-primary leading-tight">
                {getTeam(finals.score1 > finals.score2 ? finals.team1Id : finals.team2Id)?.name}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
