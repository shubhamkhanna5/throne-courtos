import { useState } from 'react';
import { Tournament, Player, Match, Pod } from '../types';
import { Search, Trophy, MapPin, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PlayerPageProps {
  tournament: Tournament;
}

export default function PlayerPage({ tournament }: PlayerPageProps) {
  const [search, setSearch] = useState('');

  const sortedPlayers = [...tournament.players].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    return b.pointsScored - a.pointsScored;
  });

  const filteredPlayers = tournament.players.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.jerseyNumber.includes(search)
  );

  const getPlayerStatus = (player: Player) => {
    if (tournament.status === 'PLAYOFFS') {
      const match = (tournament.playoffMatches || []).find(m => {
        const team1 = (tournament.playoffTeams || []).find(t => t.id === m.team1Id);
        const team2 = (tournament.playoffTeams || []).find(t => t.id === m.team2Id);
        return (team1?.captainId === player.id || team1?.partnerId === player.id ||
                team2?.captainId === player.id || team2?.partnerId === player.id) && 
               m.status === 'PENDING';
      });
      if (match) return { status: 'PLAYOFFS', pod: null, match, matches: [] };
      
      const isQualified = (tournament.playoffTeams || []).some(t => 
        t.captainId === player.id || t.partnerId === player.id
      );
      if (isQualified) return { status: 'QUALIFIED', pod: null, match: null, matches: [] };
      return { status: 'ELIMINATED', pod: null, match: null, matches: [] };
    }

    const currentRound = tournament.rounds[tournament.currentRoundIndex];
    if (!currentRound) return { status: 'WAITING', pod: null, match: null, matches: [] };

    const pod = (currentRound.pods || []).find(p => p.playerIds.includes(player.id));
    if (!pod) return { status: 'WAITING', pod: null, match: null, matches: [] };

    const matches = (pod.matches || []).filter(m => m.playerIds.includes(player.id) && m.status === 'PENDING');
    
    if (pod.status === 'LOCKED') return { status: 'FINISHED', pod, match: null, matches: [] };
    if (matches.length > 0) return { status: 'PLAYING', pod, match: null, matches };
    return { status: 'ON DECK', pod, match: null, matches: [] };
  };

  const getPlayerName = (id: string) => tournament.players.find(p => p.id === id)?.name || 'Unknown';

  const renderPlayoffMatchup = (match: any, player: Player) => {
    const team1 = (tournament.playoffTeams || []).find(t => t.id === match.team1Id);
    const team2 = (tournament.playoffTeams || []).find(t => t.id === match.team2Id);
    
    const isTeam1 = team1?.captainId === player.id || team1?.partnerId === player.id;
    const myTeam = isTeam1 ? team1 : team2;
    const otherTeam = isTeam1 ? team2 : team1;
    
    const partnerId = myTeam?.captainId === player.id ? myTeam?.partnerId : myTeam?.captainId;
    
    return (
      <div className="mt-4 p-3 bg-surface border border-dashed border-outline rounded-lg">
        <div className="text-[8px] font-bold uppercase tracking-widest text-tertiary mb-2">PLAYOFF MATCHUP ({match.stage})</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <div className="flex flex-col">
              <span className="text-[8px] text-tertiary uppercase">Partner</span>
              <span className="text-primary">{partnerId ? getPlayerName(partnerId) : 'None'}</span>
            </div>
            <div className="text-tertiary px-4">vs</div>
            <div className="flex flex-col text-right">
              <span className="text-[8px] text-tertiary uppercase">Opponents</span>
              <span className="text-primary">
                {otherTeam ? `${getPlayerName(otherTeam.captainId)}${otherTeam.partnerId ? ' & ' + getPlayerName(otherTeam.partnerId) : ''}` : 'Unknown'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMatchup = (match: Match, player: Player, label: string) => {
    const playerIndex = match.playerIds.indexOf(player.id);
    let partnerId = '';
    let opponentIds: string[] = [];

    if (playerIndex === 0) {
      partnerId = match.playerIds[1];
      opponentIds = [match.playerIds[2], match.playerIds[3]];
    } else if (playerIndex === 1) {
      partnerId = match.playerIds[0];
      opponentIds = [match.playerIds[2], match.playerIds[3]];
    } else if (playerIndex === 2) {
      partnerId = match.playerIds[3];
      opponentIds = [match.playerIds[0], match.playerIds[1]];
    } else if (playerIndex === 3) {
      partnerId = match.playerIds[2];
      opponentIds = [match.playerIds[0], match.playerIds[1]];
    }

    return (
      <div className="mt-4 p-3 bg-surface border border-dashed border-outline rounded-lg">
        <div className="text-[8px] font-bold uppercase tracking-widest text-tertiary mb-2">{label}</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <div className="flex flex-col">
              <span className="text-[8px] text-tertiary uppercase">Partner</span>
              <span className="text-primary">{getPlayerName(partnerId)}</span>
            </div>
            <div className="text-tertiary px-4">vs</div>
            <div className="flex flex-col text-right">
              <span className="text-[8px] text-tertiary uppercase">Opponents</span>
              <span className="text-primary">{getPlayerName(opponentIds[0])} & {getPlayerName(opponentIds[1])}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-tertiary" />
        <input 
          type="text" 
          placeholder="SEARCH NAME OR JERSEY #"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-surface border-2 border-outline rounded-2xl py-4 pl-12 pr-4 font-bold uppercase tracking-widest focus:outline-none focus:ring-4 focus:ring-outline/10 text-primary placeholder:text-tertiary"
        />
      </div>

      {/* Results */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {filteredPlayers.map((player) => {
            const { status, pod, matches, match } = getPlayerStatus(player) as any;
            const rank = sortedPlayers.findIndex(p => p.id === player.id) + 1;

            return (
              <motion.div 
                key={player.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-surface rounded-2xl border-2 border-outline overflow-hidden shadow-sm"
              >
                <div className="p-6 flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-tertiary">PLAYER STATUS</div>
                    <h3 className="text-2xl font-display italic font-bold text-primary">{player.name}</h3>
                    <div className="flex items-center gap-2 text-xs font-mono font-bold">
                      <span className="bg-primary text-surface px-2 py-0.5 rounded">#{player.jerseyNumber}</span>
                      <span className="text-secondary uppercase">DUPR {player.duprId}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-tertiary">RANK</div>
                    <div className="text-3xl font-display italic font-black text-primary">#{rank}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 border-t border-outline">
                  <div className="p-4 border-r border-outline text-center">
                    <div className="text-[8px] font-bold uppercase tracking-widest text-tertiary mb-1">POINTS</div>
                    <div className="text-xl font-bold text-primary">{player.points}</div>
                  </div>
                  <div className="p-4 border-r border-outline text-center">
                    <div className="text-[8px] font-bold uppercase tracking-widest text-tertiary mb-1">DIFF</div>
                    <div className="text-xl font-bold text-green-600">+{player.pointDiff}</div>
                  </div>
                  <div className="p-4 text-center">
                    <div className="text-[8px] font-bold uppercase tracking-widest text-tertiary mb-1">WINS</div>
                    <div className="text-xl font-bold text-primary">{player.podWins}</div>
                  </div>
                </div>

                <div className="bg-surface-variant p-6 border-t border-outline">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full animate-pulse ${
                        status === 'PLAYING' || status === 'PLAYOFFS' ? 'bg-green-500' : 
                        status === 'ON DECK' || status === 'QUALIFIED' ? 'bg-yellow-500' : 
                        status === 'ELIMINATED' ? 'bg-red-500' : 'bg-tertiary'
                      }`} />
                      <span className="text-sm font-bold uppercase tracking-widest text-primary">{status}</span>
                    </div>
                    {pod && (
                      <div className="flex items-center gap-2 text-xs font-bold uppercase text-secondary">
                        <MapPin className="w-3 h-3" />
                        {pod.courtName} — POD {pod.podName}
                      </div>
                    )}
                  </div>
                  
                  {status === 'PLAYOFFS' && match && renderPlayoffMatchup(match, player)}
                  
                  {matches && matches.length > 0 && (
                    <div className="space-y-4">
                      {renderMatchup(matches[0], player, 'CURRENT MATCHUP')}
                      {matches.length > 1 && renderMatchup(matches[1], player, 'UPCOMING MATCHUP')}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
