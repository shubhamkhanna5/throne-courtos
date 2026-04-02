import React, { useState, useEffect, FormEvent, Component, ErrorInfo, ReactNode } from 'react';
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
import { Trophy, LayoutDashboard, Users, Search, Settings, Swords, Lock, User, ShieldCheck, LogOut, AlertCircle, RefreshCw } from 'lucide-react';
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

  const fetchState = async (silent = false) => {
    try {
      console.log(`[App] Starting fetchState (silent: ${silent})...`);
      if (!silent) setIsLoading(true);
      const storedId = localStorage.getItem('courtos_current_tournament_id') || undefined;
      console.log('[App] Fetching tournament state for ID:', storedId);
      const data = await tournamentService.getTournament(storedId);
      if (data) {
        console.log('[App] Tournament data received:', data.id);
        setTournament(data as Tournament);
        if (data.id) {
          localStorage.setItem('courtos_current_tournament_id', data.id);
        }
      } else {
        console.warn('[App] No tournament data returned, setting state to null');
        setTournament(null);
      }
    } catch (err) {
      console.error('[App] Initial fetch failed:', err);
      setTournament(null);
    } finally {
      console.log('[App] fetchState completed, setting isLoading to false');
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
    // Supabase Realtime (Optimized 🔥)
    let channel: any = null;
    if (supabase && tournament?.id) {
      console.log('[App] Setting up realtime for tournament:', tournament.id);
      channel = supabase
        .channel(`tournament_${tournament.id}`)
        .on(
          'postgres_changes', 
          { 
            event: '*', 
            schema: 'public',
            table: 'matches',
            filter: `tournament_id=eq.${tournament.id}`
          }, 
          () => {
            console.log('[App] Realtime update: matches');
            fetchState(true);
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tournaments',
            filter: `id=eq.${tournament.id}`
          },
          () => {
            console.log('[App] Realtime update: tournament');
            fetchState(true);
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'playoff_teams',
            filter: `tournament_id=eq.${tournament.id}`
          },
          () => {
            console.log('[App] Realtime update: playoff_teams');
            fetchState(true);
          }
        )
        .subscribe();
    }

    // Failsafe polling (reduced frequency since we have Realtime)
    const interval = setInterval(() => fetchState(true), 60000);

    return () => {
      if (supabase && channel) {
        supabase.removeChannel(channel);
      }
      clearInterval(interval);
    };
  }, [tournament?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white space-y-8 p-4">
        <div className="relative">
          <Trophy className="w-20 h-20 animate-bounce text-white/20" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin" />
          </div>
        </div>
        
        <div className="space-y-4 text-center max-w-xs">
          <div className="space-y-1">
            <div className="text-3xl font-display italic font-black uppercase tracking-tighter">CourtOS</div>
            <div className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-white/40">Initializing System // Synchronizing Data</div>
          </div>
          
          <div className="pt-8 flex flex-col gap-3">
            <p className="text-[10px] font-mono text-white/20">Connection taking longer than expected...</p>
            <button 
              onClick={() => fetchState()}
              className="px-6 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-mono font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
            >
              Retry Connection
            </button>
            <button 
              onClick={() => setIsLoading(false)}
              className="text-[10px] font-mono text-white/40 underline underline-offset-4 hover:text-white transition-colors"
            >
              Force Load UI
            </button>
          </div>
        </div>
      </div>
    );
  }

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
    navigate('/');
  };

  const navItems = [
    { id: 'HYPE', path: '/scoreboard', icon: LayoutDashboard, label: 'Hype Board' },
    { id: 'OPERATOR', path: '/operator', icon: Trophy, label: 'Operator', protected: true },
    { id: 'PLAYERS', path: '/players', icon: Search, label: 'Players' },
    { id: 'PLAYOFFS', path: '/playoffs', icon: Swords, label: 'Playoffs', protected: true, hidden: tournament?.status !== 'PLAYOFFS' },
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
              <Link to="/" className="hidden md:flex items-center gap-2 mr-4">
                <Trophy className="w-6 h-6 text-white" />
                <span className="font-display italic font-bold text-xl text-white">CourtOS</span>
              </Link>
              
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
                  isAuth ? (tournament ? <OperatorDesk tournament={tournament} /> : <NoTournament onSetup={() => navigate('/admin')} />) : <Navigate to="/" />
                } />
                
                <Route path="/playoffs" element={
                  isAuth ? (tournament ? <PlayoffDraft tournament={tournament} /> : <NoTournament onSetup={() => navigate('/admin')} />) : <Navigate to="/" />
                } />
                
                <Route path="/admin" element={
                  isAuth ? <Setup tournament={tournament} /> : <Navigate to="/" />
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
