import React from 'react';
import { Tournament, Player } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUp, ArrowDown, Minus, Trophy, Download } from 'lucide-react';
import { generatePDF } from '../lib/pdf';

interface HypeBoardProps {
  tournament: Tournament;
}

export default function HypeBoard({ tournament }: HypeBoardProps) {
  const sortedPlayers = [...tournament.players].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    return b.pointsScored - a.pointsScored;
  });

  const cutLine = 8;

  return (
    <div className="space-y-12 px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero Header */}
      <div className="text-center space-y-6">
        <motion.h1 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-[10vw] editorial-title font-black leading-none tracking-tighter uppercase text-primary"
        >
          {tournament.name}
        </motion.h1>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-on-surface-variant">
          <span className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-primary" /> {tournament.mode} MODE</span>
          <span className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-primary" /> ROUND {tournament.currentRoundIndex + 1} / 4</span>
          <span className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-on-tertiary-fixed-variant" /> {tournament.status}</span>
        </div>

        {/* Ranking Priority Notice */}
        <div className="max-w-md mx-auto p-4 bg-surface-container-low border border-outline-variant rounded-xl">
          <div className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">Ranking Priority</div>
          <div className="flex justify-center gap-4 text-[11px] font-mono font-bold text-on-surface">
            <span>1. POINTS</span>
            <span className="opacity-30">/</span>
            <span>2. DIFF</span>
            <span className="opacity-30">/</span>
            <span>3. SCORED</span>
          </div>
        </div>

        <div className="pt-4">
          <button 
            onClick={() => generatePDF(tournament)}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-black border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-black/80 transition-all text-white shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Download Report
          </button>
        </div>
      </div>

      {/* Leaderboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 relative max-w-6xl mx-auto">
        <AnimatePresence mode="popLayout">
          {sortedPlayers.map((player, idx) => {
            const rank = idx + 1;
            const isQualified = rank <= cutLine;
            const delta = player.lastRank ? player.lastRank - rank : 0;

            return (
              <React.Fragment key={player.id}>
                <motion.div 
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ 
                    type: "spring",
                    stiffness: 300,
                    damping: 30
                  }}
                  className={`group flex items-center gap-4 p-4 border-b border-outline-variant transition-all hover:bg-primary hover:text-on-primary bg-surface rounded-lg relative ${
                    isQualified ? 'border-l-4 border-l-primary' : 'opacity-80 grayscale-[0.5]'
                  }`}
                >
                  {/* Rank & Delta */}
                  <div className="w-14 flex flex-col items-center shrink-0">
                    <span className="text-3xl editorial-title font-black">{rank}</span>
                    <div className="flex items-center gap-0.5 text-[8px] font-bold">
                      {delta > 0 ? (
                        <span className="text-on-tertiary-fixed-variant flex items-center bg-tertiary-container/20 px-1 rounded">▲ +{delta}</span>
                      ) : delta < 0 ? (
                        <span className="text-secondary flex items-center bg-secondary-container/20 px-1 rounded">▼ -{Math.abs(delta)}</span>
                      ) : (
                        <span className="opacity-30">— same</span>
                      )}
                    </div>
                  </div>

                  {/* Player Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black truncate uppercase tracking-tight text-on-surface group-hover:text-on-primary">{player.name}</span>
                      <span className="text-[10px] font-mono text-on-surface-variant group-hover:text-on-primary/60">#{player.jerseyNumber}</span>
                      {rank === 1 && <Trophy className="w-4 h-4 text-tertiary" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest ${
                        isQualified ? 'bg-primary/10 text-primary group-hover:bg-on-primary/20 group-hover:text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
                      }`}>
                        {isQualified ? 'Qualified' : 'Eliminated'}
                      </div>
                      <div className="text-[10px] font-mono text-on-surface-variant group-hover:text-on-primary/50 uppercase tracking-widest">
                        Court {Math.ceil(rank / 8)} — Pod {Math.ceil(rank / 4) % 2 === 1 ? 'A' : 'B'}
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex gap-6 text-right shrink-0">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-on-surface group-hover:text-on-primary">{player.points}</span>
                      <span className="text-[8px] font-mono text-on-surface-variant group-hover:text-on-primary/50 uppercase">PTS</span>
                    </div>
                    <div className="flex flex-col w-10">
                      <span className={`text-sm font-black ${player.pointDiff > 0 ? 'text-on-tertiary-fixed-variant group-hover:text-on-primary' : player.pointDiff < 0 ? 'text-secondary group-hover:text-on-primary' : 'text-on-surface group-hover:text-on-primary'}`}>
                        {player.pointDiff > 0 ? '+' : ''}{player.pointDiff}
                      </span>
                      <span className="text-[8px] font-mono text-on-surface-variant group-hover:text-on-primary/50 uppercase">DIFF</span>
                    </div>
                    <div className="flex flex-col w-10">
                      <span className="text-sm font-black text-on-surface group-hover:text-on-primary">{player.pointsScored}</span>
                      <span className="text-[8px] font-mono text-on-surface-variant group-hover:text-on-primary/50 uppercase">SCR</span>
                    </div>
                  </div>
                </motion.div>

                {/* Cut Line Visual */}
                {rank === cutLine && (
                  <div className="col-span-full my-8 relative">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <div className="w-full border-t-2 border-dashed border-primary/40"></div>
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-surface px-6 text-[10px] font-black uppercase tracking-[0.4em] text-primary border-2 border-primary/40 rounded-full py-1 shadow-sm">
                        🔥 Playoff Cut Line 🔥
                      </span>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Playoff Cut Indicator */}
      <div className="text-center py-12">
        <div className="inline-block px-10 py-6 border border-dashed border-outline rounded-2xl bg-surface-container-low editorial-shadow">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant mb-2">PLAYOFF QUALIFICATION</div>
          <div className="text-3xl editorial-title font-black text-primary">TOP {cutLine} PLAYERS ADVANCE</div>
        </div>
      </div>
    </div>
  );
}
