import React, { useState, useEffect, useRef, FormEvent, Component, ErrorInfo, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Tournament } from './types';
import { supabase } from './lib/supabase';
import { tournamentService } from './lib/tournamentService';
import Setup from './components/Setup';
import OperatorDesk from './components/OperatorDesk';
import HypeBoard from './components/HypeBoard';
import PlayerPage from './components/PlayerPage';
import PlayoffDraft from './components/PlayoffDraft';
import Home from './components/Home';
import { Trophy, LayoutDashboard, Users, Search, Settings, Swords, Lock, User, ShieldCheck, LogOut, AlertCircle, RefreshCw, AlertTriangle, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-8 text-center text-white">
          <div className="max-w-md space-y-6 bg-surface p-8 rounded-2xl border-2 border-red-100 shadow-xl text-primary">
            <AlertCircle className="w-16 h-16 mx-auto text-red-500" />
            <h2 className="text-2xl font-display italic font-bold">System Error</h2>
            <p className="text-secondary text-sm">The UI encountered an unexpected error. This usually happens due to malformed data.</p>
            <div className="p-4 bg-red-50 rounded-lg text-left overflow-auto max-h-32">
              <code className="text-[10px] text-red-800 font-mono">{this.state.error?.message}</code>
            </div>
            <button 
              onClick={() => {
                localStorage.removeItem('courtos_current_tournament_id');
                window.location.href = '/';
              }}
              className="w-full py-3 bg-primary text-surface font-bold rounded-xl hover:bg-primary-dim transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reset & Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function AppContent() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isAuth, setIsAuth] = useState(() => {
    return localStorage.getItem('courtos_is_auth') === 'true';
  });
  const [userType, setUserType] = useState<'PLAYER' | 'ADMIN' | null>(() => {
    const saved = localStorage.getItem('courtos_user_type');
    return (saved as 'PLAYER' | 'ADMIN') || null;
  });
  const [showPinModal, setShowPinModal] = useState<{ target: string } | null>(null);
  const [pin, setPin] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const isFetchingRef = useRef(false);

  const fetchState = async (silent = false, newData?: Tournament) => {
    if (newData) {
      console.log('[App] Updating state with provided data:', newData.id);
      setTournament(newData);
      setLastUpdate(new Date());
      return;
    }

    if (isFetchingRef.current) {
      console.log('[App] fetchState already in progress, skipping...');
      return;
    }
    
    try {
      setDbError(null);
      isFetchingRef.current = true;
      console.log(`[App] Starting fetchState (silent: ${silent})...`);
      if (!silent) setIsLoading(true);
      if (silent) setIsSyncing(true);
      
      const storedId = localStorage.getItem('courtos_current_tournament_id');
      if (!storedId) {
        // Try to get the latest tournament if none stored
        const { data: latest } = await supabase
          .from('tournaments')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (latest) {
          localStorage.setItem('courtos_current_tournament_id', latest.id);
        } else {
          setIsLoading(false);
          setIsSyncing(false);
          return;
        }
      }

      const currentId = localStorage.getItem('courtos_current_tournament_id');
      console.log('[App] Fetching tournament state for ID:', currentId);
      
      if (!supabase) {
        console.warn('[App] Supabase client not initialized, skipping RPC...');
        const fallbackData = await tournamentService.getTournament(currentId || undefined);
        if (fallbackData) {
          setTournament(fallbackData as Tournament);
          setLastUpdate(new Date());
        }
        setIsLoading(false);
        return;
      }

      // Use the RPC as requested by the user
      const { data, error } = await supabase.rpc('get_tournament_state', {
        p_tournament_id: currentId
      });

      if (error) {
        console.error('[App] RPC get_tournament_state failed:', error.message);
        if (error.message?.includes('Invalid API key')) {
          setDbError('Supabase authentication failed. Please check your VITE_SUPABASE_ANON_KEY and VITE_SUPABASE_URL in the Settings menu.');
        } else if (error.message?.includes('column')) {
          setDbError(`Database Schema Mismatch: ${error.message}. Please run the SQL migrations in Supabase.`);
        } else {
          setDbError(error.message);
        }
        // Fallback to existing service if RPC fails
        const fallbackData = await tournamentService.getTournament(currentId || undefined);
        if (fallbackData) {
          setTournament(fallbackData as Tournament);
          setLastUpdate(new Date());
        }
      } else if (data) {
        console.log('[App] Tournament data received via RPC:', data.id);
        setTournament(data as Tournament);
        setLastUpdate(new Date());
      } else {
        setTournament(null);
      }
    } catch (err) {
      console.error('[App] fetchState failed:', err);
      if (!silent) setTournament(null);
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  const runMigrations = async () => {
    try {
      setIsLoading(true);
      const { error } = await supabase.rpc('run_migrations');
      if (error) throw error;
      alert('Migrations completed successfully! Refreshing app...');
      window.location.reload();
    } catch (err: any) {
      console.error('Migration failed:', err);
      alert('Migration failed: ' + (err.message || err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchState(false);
    
    // Fallback timeout to prevent infinite loading screen
    const timeout = setTimeout(() => {
      if (isLoading) {
        console.warn('[App] Loading timeout reached, forcing isLoading to false');
        setIsLoading(false);
      }
    }, 15000); // 15s fallback

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    // Supabase Realtime (New Architecture 🚀)
    let channel: any = null;
    if (supabase && tournament?.id) {
      console.log('[App] Subscribing to tournament-realtime:', tournament.id);
      
      channel = supabase
        .channel(`tournament-realtime-${tournament.id}`)
        // MATCH UPDATES
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournament.id}` },
          (payload: any) => {
            console.log('🎯 match update', payload);
            fetchState(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'players', filter: `tournament_id=eq.${tournament.id}` },
          (payload: any) => {
            console.log('📊 player update', payload);
            fetchState(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pods', filter: `tournament_id=eq.${tournament.id}` },
          (payload: any) => {
            console.log('📦 pod update', payload);
            fetchState(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rounds', filter: `tournament_id=eq.${tournament.id}` },
          (payload: any) => {
            console.log('🔄 round update', payload);
            fetchState(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${tournament.id}` },
          (payload: any) => {
            console.log('🏆 tournament update', payload);
            fetchState(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'playoff_teams', filter: `tournament_id=eq.${tournament.id}` },
          (payload: any) => {
            console.log('👥 playoff teams update', payload);
            fetchState(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'playoff_matches', filter: `tournament_id=eq.${tournament.id}` },
          (payload: any) => {
            console.log('⚔️ playoff matches update', payload);
            fetchState(true);
          }
        )
        .subscribe((status: string, err?: any) => {
          console.log(`[App] Realtime status for ${tournament.id}:`, status, err || '');
          
          if (status === 'SUBSCRIBED') {
            setSyncError(null);
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[App] Realtime connection error:', status, err);
            setSyncError(status);
            // Exponential backoff or simple delay
            setTimeout(() => {
              setRetryCount(prev => prev + 1);
              fetchState(true);
            }, 5000);
          }
        });
    }

    // Failsafe polling (reduced frequency since we have Realtime)
    const interval = setInterval(() => fetchState(true), 60000);

    return () => {
      if (supabase && channel) {
        supabase.removeChannel(channel);
      }
      clearInterval(interval);
    };
  }, [tournament?.id, retryCount]);

  // Removed full-screen loading screen as per user request
  
  const handleProtectedLink = (e: React.MouseEvent, path: string) => {
    if (!isAuth) {
      e.preventDefault();
      setShowPinModal({ target: path });
      setPin('');
    }
  };

  const handlePinSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (pin === '1234') {
      setIsAuth(true);
      localStorage.setItem('courtos_is_auth', 'true');
      setUserType('ADMIN');
      localStorage.setItem('courtos_user_type', 'ADMIN');
      if (showPinModal) navigate(showPinModal.target);
      else navigate('/admin');
      setShowPinModal(null);
    } else {
      alert('Invalid PIN');
      setPin('');
    }
  };

  const handleLogout = () => {
    setIsAuth(false);
    localStorage.removeItem('courtos_is_auth');
    setUserType(null);
    localStorage.removeItem('courtos_user_type');
    setTimeout(() => {
      window.location.href = '/';
    }, 5000);
  };

  const navItems = [
    { id: 'HYPE', path: '/scoreboard', icon: LayoutDashboard, label: 'Hype Board' },
    { id: 'OPERATOR', path: '/operator', icon: Trophy, label: 'Operator', protected: true },
    { id: 'PLAYERS', path: '/players', icon: Search, label: 'Players' },
    { id: 'PLAYOFFS', path: '/playoffs', icon: Swords, label: 'Playoffs', protected: true, hidden: !['TEAM_SELECTION', 'PLAYOFFS'].includes(tournament?.status || '') },
    { id: 'SETUP', path: '/admin', icon: Settings, label: 'Admin', protected: true },
  ];

  console.log('[App] Rendering. isLoading:', isLoading, 'tournament:', tournament?.id, 'userType:', userType, 'path:', location.pathname);

  // If no user type selected, show home page (unless already on home)
  if (!userType && location.pathname !== '/') {
    return <Navigate to="/" />;
  }

  return (
    <div className="min-h-screen bg-surface-container-lowest text-primary font-sans">
      {/* Navigation Rail - Only show if userType is selected and NOT on home page */}
      {userType && location.pathname !== '/' && (
        <nav className="fixed bottom-0 left-0 right-0 bg-black border-t border-white/10 z-50 md:top-0 md:bottom-auto md:border-b md:border-t-0">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4 md:gap-12 flex-1 text-white">
              <div className="flex items-center gap-4">
                <Link to="/" className="hidden md:flex items-center gap-2">
                  <Trophy className="w-6 h-6 text-white" />
                  <span className="font-display italic font-bold text-xl text-white">CourtOS</span>
                </Link>
                
                {/* Live Sync Indicator */}
                <button 
                  onClick={() => {
                    setRetryCount(prev => prev + 1);
                    fetchState(false);
                  }}
                  className={`flex items-center gap-2 px-2 py-0.5 rounded-full border transition-all ${
                    syncError ? 'bg-red-500/20 border-red-500/50 hover:bg-red-500/30' : 'bg-white/10 border-white/10 hover:bg-white/20'
                  }`}
                  title={syncError ? 'Connection Error - Click to Reconnect' : 'Live Sync Active'}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    syncError ? 'bg-red-500 animate-pulse' : (isSyncing ? 'bg-primary animate-pulse' : 'bg-green-400')
                  }`} />
                  <span className={`text-[8px] font-mono font-bold uppercase tracking-widest ${syncError ? 'text-red-400' : 'opacity-60'}`}>
                    {syncError ? 'Connection Error' : (isSyncing ? 'Syncing...' : (lastUpdate ? `Live — ${lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Live'))}
                  </span>
                </button>
              </div>
              
              <div className="flex items-center gap-2 md:gap-6">
                {navItems
                  .filter(t => !t.hidden)
                  .filter(t => userType === 'ADMIN' || !t.protected)
                  .map((item) => (
                    <Link
                      key={item.id}
                      to={item.path}
                      onClick={(e) => item.protected ? handleProtectedLink(e, item.path) : null}
                      className={`flex flex-col md:flex-row items-center gap-1 md:gap-2 px-3 py-1 rounded-lg transition-all ${
                        location.pathname === item.path ? 'bg-white text-black' : 'hover:bg-white/10 text-white/70'
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="text-[10px] md:text-sm font-bold uppercase tracking-wider">{item.label}</span>
                    </Link>
                  ))}
              </div>
            </div>

            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-1 text-white/70 hover:text-white transition-colors"
              title="Exit Session"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden md:inline text-xs font-bold uppercase tracking-wider">Exit</span>
            </button>
          </div>
        </nav>
      )}

      {/* Main Content */}
      <main className={`${(userType && location.pathname !== '/') ? 'pt-4 pb-24 md:pt-20 md:pb-8 px-4 max-w-7xl mx-auto' : ''}`}>
        {dbError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3 text-red-700">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-bold uppercase tracking-tight">{dbError}</p>
            </div>
            <button
              onClick={runMigrations}
              disabled={isLoading}
              className="px-4 py-2 bg-red-600 text-white text-xs font-black uppercase tracking-widest rounded hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <RotateCcw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              Run Database Migrations
            </button>
          </div>
        )}
        <ErrorBoundary>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Routes location={location}>
                <Route path="/" element={
                  <Home 
                    playerCount={tournament?.players?.length || 0}
                    courtCount={tournament?.rounds?.[0]?.pods?.length || 0}
                    onPlayerLogin={() => {
                      setUserType('PLAYER');
                      localStorage.setItem('courtos_user_type', 'PLAYER');
                      navigate('/scoreboard');
                    }}
                    onAdminLogin={() => {
                      if (isAuth) {
                        setUserType('ADMIN');
                        localStorage.setItem('courtos_user_type', 'ADMIN');
                        navigate('/admin');
                      } else {
                        setShowPinModal({ target: '/admin' });
                      }
                    }}
                    onScoreEntry={() => {
                      if (isAuth) {
                        setUserType('ADMIN');
                        localStorage.setItem('courtos_user_type', 'ADMIN');
                        navigate('/operator');
                      } else {
                        setShowPinModal({ target: '/operator' });
                      }
                    }}
                    onSearchPlayers={() => {
                      setUserType('PLAYER');
                      localStorage.setItem('courtos_user_type', 'PLAYER');
                      navigate('/players');
                    }}
                  />
                } />
                <Route path="/scoreboard" element={tournament ? <HypeBoard tournament={tournament} /> : <NoTournament onSetup={() => setShowPinModal({ target: '/admin' })} />} />
                <Route path="/players" element={tournament ? <PlayerPage tournament={tournament} /> : <NoTournament onSetup={() => setShowPinModal({ target: '/admin' })} />} />
                
                <Route path="/operator" element={
                  isAuth ? (tournament ? <OperatorDesk tournament={tournament} onRefresh={fetchState} /> : <NoTournament onSetup={() => navigate('/admin')} />) : <Navigate to="/" />
                } />
                
                <Route path="/playoffs" element={
                  isAuth ? (tournament ? <PlayoffDraft tournament={tournament} onRefresh={fetchState} /> : <NoTournament onSetup={() => navigate('/admin')} />) : <Navigate to="/" />
                } />
                
                <Route path="/admin" element={
                  isAuth ? <Setup tournament={tournament} onRefresh={fetchState} /> : <Navigate to="/" />
                } />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </ErrorBoundary>
      </main>

      {/* PIN Modal */}
      <AnimatePresence>
        {showPinModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface p-8 rounded-2xl shadow-2xl max-w-xs w-full text-center border-2 border-outline"
            >
              <Lock className="w-12 h-12 mx-auto mb-4 text-primary" />
              <h3 className="text-xl font-bold mb-2 text-primary">Operator Access</h3>
              <p className="text-sm text-secondary mb-6">Enter the 4-digit system PIN</p>
              <form onSubmit={handlePinSubmit} className="space-y-4">
                <input 
                  type="password" 
                  maxLength={4}
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full text-center text-4xl tracking-[1em] font-mono border-b-4 border-outline focus:outline-none py-2 bg-transparent text-primary"
                />
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => setShowPinModal(null)}
                    className="flex-1 py-3 font-bold text-secondary hover:bg-surface-container rounded-lg"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-primary text-surface font-bold rounded-lg hover:bg-primary-dim"
                  >
                    Unlock
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NoTournament({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="flex items-center justify-center p-4 min-h-[60vh]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface p-8 rounded-xl shadow-2xl max-w-md w-full text-center border border-outline"
      >
        <Trophy className="w-16 h-16 mx-auto mb-6 text-primary" />
        <h1 className="text-3xl font-bold mb-4 font-display italic text-primary">CourtOS</h1>
        <p className="text-secondary mb-8">No active tournament found. Initialize a new event to begin.</p>
        <button 
          onClick={onSetup}
          className="w-full bg-primary text-surface py-3 rounded-lg font-bold hover:bg-primary-dim transition-colors"
        >
          Create Tournament
        </button>
      </motion.div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
