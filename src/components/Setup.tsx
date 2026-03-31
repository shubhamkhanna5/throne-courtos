import React, { useState, useEffect, FormEvent } from 'react';
import { Tournament, TournamentMode, Player } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Plus, Play, RotateCcw, CheckCircle2, Clock, UserPlus, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SetupProps {
  tournament: Tournament | null;
}

export default function Setup({ tournament }: SetupProps) {
  const [name, setName] = useState(tournament?.name || 'Spring Pickleball Ladder');
  const [mode, setMode] = useState<TournamentMode>(tournament?.mode || 'MINI');
  const [players, setPlayers] = useState<Partial<Player>[]>(tournament?.players || []);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [recentTournaments, setRecentTournaments] = useState<{ id: string, name: string, status: string, created_at: string }[]>([]);

  useEffect(() => {
    if (tournament) {
      setName(tournament.name);
      setMode(tournament.mode);
      setPlayers(tournament.players || []);
    }
    fetchRecentTournaments();
  }, [tournament]);

  const fetchRecentTournaments = async () => {
    try {
      const response = await fetch('/api/tournaments');
      if (response.ok) {
        const data = await response.json();
        setRecentTournaments(data);
      }
    } catch (err) {
      console.error('Failed to fetch recent tournaments:', err);
    }
  };

  const handleLoadTournament = async (id: string) => {
    try {
      const response = await fetch('/api/tournament/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (response.ok) {
        // State update will happen via socket
      }
    } catch (err) {
      console.error('Failed to load tournament:', err);
    }
  };

  const handleDeleteTournament = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this tournament? This action cannot be undone.')) return;
    
    try {
      const response = await fetch('/api/tournament/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (response.ok) {
        fetchRecentTournaments();
      }
    } catch (err) {
      console.error('Failed to delete tournament:', err);
    }
  };
  
  // Registration form state
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regDupr, setRegDupr] = useState('');
  const [regJersey, setRegJersey] = useState('');

  const handleRegister = (e: FormEvent) => {
    e.preventDefault();
    if (!regName || !regJersey) return;
    
    const newPlayer: Partial<Player> = {
      id: uuidv4(),
      name: regName,
      phone: regPhone,
      email: regEmail,
      duprId: regDupr,
      jerseyNumber: regJersey,
      points: 0,
      pointDiff: 0,
      pointsScored: 0,
      podWins: 0
    };
    
    setPlayers([newPlayer, ...players]);
    setRegName('');
    setRegPhone('');
    setRegEmail('');
    setRegDupr('');
    setRegJersey('');
  };

  const removePlayer = (id: string) => {
    setPlayers(players.filter(p => p.id !== id));
  };

  const handleSetup = async () => {
    const requiredCount = mode === 'MAJOR' ? 32 : mode === 'CORE' ? 24 : 16;
    if (players.length < requiredCount) {
      alert(`Mode ${mode} requires at least ${requiredCount} players. Current: ${players.length}`);
      return;
    }

    setIsSettingUp(true);
    try {
      const response = await fetch('/api/tournament/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          mode, 
          players: players.filter(p => p.name && p.jerseyNumber).slice(0, requiredCount) 
        }),
      });
      
      if (response.ok) {
        const seedingResponse = await fetch('/api/tournament/start-seeding', { method: 'POST' });
        if (!seedingResponse.ok) {
          const errorData = await seedingResponse.json();
          alert(`Failed to start seeding: ${typeof errorData.error === 'object' ? JSON.stringify(errorData.error) : (errorData.error || 'Unknown error')}`);
        }
      } else {
        const errorData = await response.json();
        alert(`Failed to setup tournament: ${typeof errorData.error === 'object' ? JSON.stringify(errorData.error) : (errorData.error || 'Unknown error')}`);
      }
    } catch (error) {
      console.error('Setup error:', error);
      alert('An error occurred during setup. Please check the console.');
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleReset = async () => {
    if (confirm('Are you sure you want to reset the current tournament? This will delete all matches and pods for the current event.')) {
      await fetch('/api/tournament/reset', { method: 'POST' });
    }
  };

  const handleWipeAll = async () => {
    if (confirm('NUCLEAR OPTION: This will delete ALL tournament history from Supabase. Are you absolutely sure?')) {
      await fetch('/api/tournament/clear-all', { method: 'POST' });
    }
  };

  const bulkAdd = () => {
    const count = mode === 'MAJOR' ? 32 : mode === 'CORE' ? 24 : 16;
    const names = [
      'James Wilson', 'Sarah Miller', 'Robert Taylor', 'Linda Anderson',
      'Michael Thomas', 'Barbara Jackson', 'William White', 'Elizabeth Harris',
      'David Martin', 'Jennifer Thompson', 'Richard Garcia', 'Maria Martinez',
      'Joseph Robinson', 'Susan Clark', 'Thomas Rodriguez', 'Margaret Lewis',
      'Charles Lee', 'Dorothy Walker', 'Christopher Hall', 'Lisa Allen',
      'Daniel Young', 'Nancy Hernandez', 'Matthew King', 'Karen Wright',
      'Anthony Lopez', 'Betty Hill', 'Mark Scott', 'Helen Green',
      'Donald Adams', 'Sandra Baker', 'Steven Gonzalez', 'Donna Nelson'
    ];
    
    const newPlayers: Partial<Player>[] = Array.from({ length: count }).map((_, i) => ({
      id: uuidv4(),
      name: names[i] || `Player ${i + 1}`,
      phone: `555-01${(i + 1).toString().padStart(2, '0')}`,
      email: `${(names[i] || `p${i+1}`).toLowerCase().replace(/\s+/g, '.')}@example.com`,
      duprId: (3.5 + Math.random() * 2).toFixed(2),
      jerseyNumber: (i + 1).toString().padStart(2, '0'),
      points: 0,
      pointDiff: 0,
      pointsScored: 0,
      podWins: 0
    }));
    setPlayers(newPlayers);
  };

  const requiredCount = mode === 'MAJOR' ? 32 : mode === 'CORE' ? 24 : 16;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Config Area */}
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-surface p-8 sm:p-10 rounded-2xl border border-outline shadow-xl editorial-shadow">
            <div className="flex flex-col sm:flex-row justify-between items-start mb-12 gap-6">
              <div className="space-y-2">
                <h1 className="text-4xl sm:text-5xl editorial-title font-black tracking-tighter uppercase text-primary">Tournament Configuration</h1>
                <p className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-on-surface-variant">OPERATIONAL MODULE // CORE CONFIGURATION & PLAYER INGRESS</p>
              </div>
              <div className="bg-surface-container-low px-4 py-2 rounded border border-outline-variant text-right self-start sm:self-auto">
                <div className="text-[8px] font-bold uppercase text-on-surface-variant">SYSTEM STATUS</div>
                <div className="text-xs font-black uppercase tracking-widest text-on-surface">READY FOR INGRESS</div>
              </div>
            </div>

            {/* 00. Tournament Name */}
            <section className="space-y-6 mb-12">
              <div className="flex items-center gap-4">
                <span className="text-xs font-mono font-bold text-on-surface-variant opacity-50">00.</span>
                <h2 className="text-xs font-black uppercase tracking-widest text-on-surface">TOURNAMENT NAME</h2>
              </div>
              <div className="space-y-2">
                <input 
                  type="text" 
                  placeholder="E.G. SPRING PICKLEBALL LADDER"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent border-b border-outline-variant py-2 focus:outline-none focus:border-primary editorial-title text-3xl text-on-surface placeholder:text-on-surface-variant/30"
                />
              </div>
            </section>

            {/* 01. Mode Selection */}
            <section className="space-y-6 mb-12">
              <div className="flex items-center gap-4">
                <span className="text-xs font-mono font-bold text-on-surface-variant opacity-50">01.</span>
                <h2 className="text-xs font-black uppercase tracking-widest text-on-surface">CONFIGURATION MATRIX</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { id: 'MAJOR', label: 'Major', desc: '64+ SLOTS / DOUBLE ELIM / PROFESSIONAL', count: 32 },
                  { id: 'CORE', label: 'Core', desc: '32 SLOTS / ROUND ROBIN / STANDARD', count: 24 },
                  { id: 'MINI', label: 'Mini', desc: '16 SLOTS / SINGLE ELIM / FLASH', count: 16 },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id as TournamentMode)}
                    className={`relative p-6 rounded-xl border transition-all ${
                      mode === m.id 
                        ? 'bg-primary text-on-primary border-primary shadow-lg scale-[1.02]' 
                        : 'bg-surface-container-lowest border-outline-variant hover:border-outline text-on-surface'
                    }`}
                  >
                    <div className={`text-[10px] font-mono font-bold uppercase mb-1 ${mode === m.id ? 'text-on-primary/60' : 'text-on-surface-variant'}`}>MODE {m.id === 'MAJOR' ? '01' : m.id === 'CORE' ? '02' : '03'}</div>
                    <div className="text-3xl editorial-title font-black mb-4">{m.label}</div>
                    <div className={`text-[8px] font-bold leading-relaxed ${mode === m.id ? 'text-on-primary/70' : 'text-on-surface-variant'}`}>{m.desc}</div>
                    {mode === m.id && <CheckCircle2 className="absolute top-4 right-4 w-4 h-4 text-on-primary" />}
                  </button>
                ))}
              </div>
            </section>

            {/* 02. Registration */}
            <section className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="text-xs font-mono font-bold text-on-surface-variant opacity-50">02.</span>
                <h2 className="text-xs font-black uppercase tracking-widest text-on-surface">PLAYER REGISTRATION</h2>
              </div>
              <form onSubmit={handleRegister} className="space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">PLAYER LEGAL NAME</label>
                    <input 
                      type="text" 
                      placeholder="E.G. JONATHAN REED"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="w-full bg-transparent border-b border-outline-variant py-2 focus:outline-none focus:border-primary editorial-title text-xl text-on-surface placeholder:text-on-surface-variant/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">PHONE NUMBER</label>
                    <input 
                      type="tel" 
                      placeholder="555-0123"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      className="w-full bg-transparent border-b border-outline-variant py-2 focus:outline-none focus:border-primary font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">EMAIL ADDRESS</label>
                    <input 
                      type="email" 
                      placeholder="REED.J@NET.OPERATOR"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="w-full bg-transparent border-b border-outline-variant py-2 focus:outline-none focus:border-primary font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">DUPR GLOBAL IDENTIFIER</label>
                    <input 
                      type="text" 
                      placeholder="ID-8829-001"
                      value={regDupr}
                      onChange={(e) => setRegDupr(e.target.value)}
                      className="w-full bg-transparent border-b border-outline-variant py-2 focus:outline-none focus:border-primary font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">COMBAT JERSEY ASSIGNMENT</label>
                    <input 
                      type="text" 
                      placeholder="42"
                      value={regJersey}
                      onChange={(e) => setRegJersey(e.target.value)}
                      className="w-full bg-transparent border-b border-outline-variant py-2 focus:outline-none focus:border-primary font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between pt-4 gap-6">
                  <div className="text-[8px] font-mono font-bold uppercase text-on-surface-variant italic">AUTO-SAVE ENABLED // PERSISTENCE ACTIVE</div>
                  <div className="flex gap-4 w-full sm:w-auto">
                    <button 
                      type="button"
                      onClick={bulkAdd}
                      className="flex-1 sm:flex-none px-6 py-3 bg-black text-white rounded-lg font-black uppercase tracking-widest text-xs hover:bg-black/80 transition-colors"
                    >
                      BULK FILL
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 sm:flex-none bg-primary text-on-primary px-10 py-4 rounded-lg font-black uppercase tracking-widest text-sm hover:bg-primary-dim shadow-lg transition-colors"
                    >
                      REGISTER PLAYER
                    </button>
                  </div>
                </div>
              </form>
            </section>

            {/* Global Actions */}
            <div className="mt-16 pt-12 border-t border-outline-variant space-y-4">
              <button 
                onClick={handleSetup}
                disabled={isSettingUp || players.length < requiredCount || (!!tournament && tournament.status !== 'SETUP')}
                className="w-full bg-primary text-on-primary py-6 rounded-xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-4 hover:bg-primary-dim shadow-2xl disabled:opacity-20 transition-all"
              >
                {isSettingUp ? (
                  <div className="flex items-center gap-3">
                    <Clock className="w-6 h-6 animate-spin" />
                    INITIALIZING SYSTEM...
                  </div>
                ) : (
                  <>
                    <Play className="w-6 h-6 fill-current" />
                    INITIALIZE & START SEEDING
                  </>
                )}
              </button>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={handleReset}
                  className="flex-1 py-4 bg-black text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-black/80 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  RESET CURRENT
                </button>
                <button 
                  onClick={handleWipeAll}
                  className="flex-1 py-4 bg-red-600 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  WIPE ALL DATA
                </button>
              </div>
            </div>
          </div>
        </div>

          {/* Sidebar: Recent Ingress */}
          <div className="lg:col-span-4 space-y-6">
            {/* Recent Tournaments (Load State) */}
            <div className="bg-surface rounded-2xl border border-outline overflow-hidden shadow-lg">
              <div className="bg-surface-container-low p-4 border-b border-outline flex justify-between items-center">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-on-surface">LOAD TOURNAMENT</h3>
                <div className="bg-primary text-on-primary px-2 py-0.5 rounded text-[10px] font-mono">{recentTournaments.length}</div>
              </div>
              <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto">
                {recentTournaments.map((t) => (
                  <div key={t.id} className="relative group">
                    <button
                      onClick={() => handleLoadTournament(t.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        tournament?.id === t.id 
                          ? 'bg-primary text-on-primary border-primary' 
                          : 'bg-black text-white border-white/20 hover:bg-black/80'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="text-xs font-black uppercase tracking-tight text-on-surface truncate pr-8">{t.name}</div>
                        <div className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${
                          t.status === 'FINISHED' ? 'bg-green-500/20 text-green-500' : 'bg-blue-500/20 text-blue-500'
                        }`}>{t.status}</div>
                      </div>
                      <div className="text-[8px] font-mono text-on-surface-variant opacity-50 uppercase">
                        {new Date(t.created_at).toLocaleDateString()} // {t.id.slice(0, 8)}
                      </div>
                    </button>
                    <button
                      onClick={(e) => handleDeleteTournament(e, t.id)}
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1 text-secondary hover:bg-secondary-container/10 rounded transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {recentTournaments.length === 0 && (
                  <div className="py-8 text-center opacity-20">
                    <div className="text-[10px] font-black uppercase tracking-widest text-on-surface">NO HISTORY</div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-surface rounded-2xl border border-outline overflow-hidden shadow-lg">
            <div className="bg-surface-container-low p-4 border-b border-outline flex justify-between items-center">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-on-surface">RECENT INGRESS</h3>
              <div className="bg-primary text-on-primary px-2 py-0.5 rounded text-[10px] font-mono">{players.length}/{requiredCount}</div>
            </div>
            <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
              <AnimatePresence mode="popLayout">
                {players.map((p) => (
                  <motion.div 
                    key={p.id}
                    layout
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                    className="group bg-surface-container-lowest p-4 rounded-xl border border-outline-variant hover:border-primary transition-all relative"
                  >
                    <button 
                      onClick={() => removePlayer(p.id!)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-secondary p-1 hover:bg-secondary-container/10 rounded transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-sm font-black uppercase tracking-tight text-on-surface">{p.name}</div>
                      <div className="text-[10px] font-mono text-on-surface-variant opacity-60">#{p.jerseyNumber}</div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="text-[8px] font-mono text-on-surface-variant opacity-50 uppercase">DUPR: {p.duprId || 'TBD'}</div>
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full bg-on-tertiary-fixed-variant" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">VERIFIED</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {players.length === 0 && (
                <div className="py-12 text-center space-y-4 opacity-20">
                  <UserPlus className="w-12 h-12 mx-auto text-on-surface" />
                  <div className="text-[10px] font-black uppercase tracking-widest text-on-surface">AWAITING INGRESS</div>
                </div>
              )}
            </div>
            <div className="bg-surface-container-low p-4 border-t border-outline-variant text-center">
              <button className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-all">VIEW ALL DATA</button>
            </div>
          </div>

          {players.length < requiredCount && players.length > 0 && (
            <div className="bg-tertiary-container/10 border border-tertiary p-6 rounded-2xl flex gap-4 items-start">
              <AlertTriangle className="w-6 h-6 text-tertiary shrink-0" />
              <div className="space-y-1">
                <div className="text-xs font-black uppercase tracking-widest text-on-tertiary-container">INCOMPLETE ROSTER</div>
                <p className="text-[10px] font-medium text-on-tertiary-container/80 leading-relaxed">System requires {requiredCount - players.length} more players to initialize the {mode} matrix.</p>
              </div>
            </div>
          )}

          {!!tournament && tournament.status !== 'SETUP' && (
            <div className="bg-primary-container/20 border border-primary p-6 rounded-2xl flex gap-4 items-start">
              <AlertTriangle className="w-6 h-6 text-primary shrink-0" />
              <div className="space-y-1">
                <div className="text-xs font-black uppercase tracking-widest text-on-primary-container">TOURNAMENT ACTIVE</div>
                <p className="text-[10px] font-medium text-on-primary-container/80 leading-relaxed">A tournament is currently in progress ({tournament.status}). Reset the current event to initialize a new one.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

  );
}
