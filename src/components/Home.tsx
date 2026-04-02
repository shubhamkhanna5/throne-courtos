import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Search, Settings, Edit3, User, ShieldCheck } from 'lucide-react';

interface HomeProps {
  onPlayerLogin: () => void;
  onAdminLogin: () => void;
  onScoreEntry: () => void;
  onSearchPlayers: () => void;
  playerCount?: number;
  courtCount?: number;
}

export default function Home({ 
  onPlayerLogin, 
  onAdminLogin, 
  onScoreEntry,
  onSearchPlayers,
  playerCount = 1402, 
  courtCount = 84 
}: HomeProps) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="h-20 px-8 flex items-center justify-between border-b border-white/10 bg-black text-white z-50">
        <div className="flex items-center gap-2">
          <span className="font-display italic font-black text-2xl tracking-tighter uppercase">COURTOS</span>
        </div>
        
        <div className="flex items-center gap-12">
          <nav className="hidden md:flex items-center gap-8">
            <button onClick={onPlayerLogin} className="home-label text-white/80 hover:text-white transition-colors">PLAYER PORTAL</button>
            <button onClick={onAdminLogin} className="home-label text-white/80 hover:text-white transition-colors">ADMIN CONSOLE</button>
          </nav>

          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <Settings className="w-5 h-5" />
            </button>
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <User className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Split */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Pane: Player Portal */}
        <motion.section 
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="home-pane-left group/pane"
        >
          <div className="flex justify-between items-start mb-8">
            <span className="home-label text-[#8A9A5B]">TERMINAL // 01</span>
          </div>

          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.03 }}
            transition={{ delay: 0.4, duration: 1 }}
            className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden"
          >
            <svg viewBox="0 0 100 100" className="w-[80%] h-[80%] text-black fill-current">
              <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="0.5" fill="none" />
              <rect x="30" y="20" width="40" height="30" stroke="currentColor" strokeWidth="0.5" fill="none" />
              <path d="M30 50 Q50 70 70 50" stroke="currentColor" strokeWidth="0.5" fill="none" />
            </svg>
          </motion.div>

          <div className="relative z-10 space-y-12">
            <motion.h1 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="home-heading"
            >
              PLAYER<br />PORTAL
            </motion.h1>

            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="max-w-xs text-sm text-black/60 leading-relaxed font-medium"
            >
              Access the global scoreboard, track real-time statistics, and manage your operator profile. Tactical data for the modern competitor.
            </motion.p>

            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="flex flex-col gap-4 w-full max-w-sm"
            >
              <button 
                onClick={onPlayerLogin}
                className="home-button-dark"
              >
                <span className="home-label text-white">SCOREBOARD ACCESS</span>
                <ArrowRight className="w-5 h-5 group-hover/pane:translate-x-1 transition-transform" />
              </button>
              
              <button 
                onClick={onSearchPlayers}
                className="home-button-outline"
              >
                <span className="home-label">SEARCH PLAYERS</span>
                <Search className="w-5 h-5" />
              </button>
            </motion.div>
          </div>
        </motion.section>

        {/* Right Pane: Admin Console */}
        <motion.section 
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="home-pane-right group/pane"
        >
          <div className="flex justify-end items-start mb-8">
            <span className="home-label text-[#D22B2B]">OPERATOR // SECURE</span>
          </div>

          <div className="relative z-10 space-y-12 flex flex-col items-end text-right">
            <motion.h1 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="home-heading"
            >
              ADMIN<br />CONSOLE
            </motion.h1>

            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="max-w-xs text-sm text-black/60 leading-relaxed font-medium"
            >
              Execute tournament protocols, deploy score updates, and manage system logs. Command-level authorization required.
            </motion.p>

            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="flex flex-col gap-4 w-full max-w-sm"
            >
              <button 
                onClick={onAdminLogin}
                className="home-button-dark"
              >
                <span className="home-label text-white">TOURNAMENT SETUP</span>
                <Settings className="w-5 h-5" />
              </button>
              
              <button 
                onClick={onScoreEntry}
                className="home-button-outline"
              >
                <span className="home-label">SCORE ENTRY</span>
                <Edit3 className="w-5 h-5" />
              </button>
            </motion.div>
          </div>

          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="relative z-10 flex justify-between items-end pt-8 border-t border-black/10"
          >
            <div>
              <div className="home-stat-label">SYSTEM_STATUS</div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-[#8A9A5B] rounded-full animate-pulse" />
                <span className="home-stat-value text-3xl">OPERATIONAL</span>
              </div>
            </div>
            
            <div className="bg-white p-4 border-l-4 border-[#8A9A5B] shadow-sm min-w-[240px]">
              <div className="flex items-center gap-3">
                <div className="bg-[#8A9A5B]/10 p-2">
                  <ShieldCheck className="w-5 h-5 text-[#8A9A5B]" />
                </div>
                <div className="text-left">
                  <div className="home-label text-[8px] text-black/40">VERSION</div>
                  <div className="font-mono text-[10px] font-bold">UPLINK_READY</div>
                  <div className="font-mono text-[8px] text-black/40">Connected to HK-CENTRAL-01</div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className="h-16 px-8 flex items-center justify-between border-t border-white/10 bg-black text-[10px] font-mono uppercase tracking-widest text-white/40">
        <div className="flex gap-8">
          <span>CourtOS Tactical Systems © 2024</span>
          <button className="hover:text-white transition-colors">Privacy</button>
          <button className="hover:text-white transition-colors">Terminal_CMD</button>
          <button className="text-[#8A9A5B] font-bold">System_Status</button>
        </div>
        <div className="font-display italic font-black text-white text-sm tracking-tighter">
          STAY_FOCUSED
        </div>
      </footer>
    </div>
  );
}
