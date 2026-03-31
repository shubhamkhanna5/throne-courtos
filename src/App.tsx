import React, { useState, useEffect, FormEvent } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import socket from './lib/socket';
import { Tournament } from './types';
import Setup from './components/Setup';
import OperatorDesk from './components/OperatorDesk';
import HypeBoard from './components/HypeBoard';
import PlayerPage from './components/PlayerPage';
import PlayoffDraft from './components/PlayoffDraft';
import Home from './components/Home';
import { Trophy, LayoutDashboard, Users, Search, Settings, Swords, Lock, User, ShieldCheck, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

function AppContent() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [isAuth, setIsAuth] = useState(false);
  const [userType, setUserType] = useState<'PLAYER' | 'ADMIN' | null>(() => {
    const saved = localStorage.getItem('courtos_user_type');
    return (saved as 'PLAYER' | 'ADMIN') || null;
  });
  const [showPinModal, setShowPinModal] = useState<{ target: string } | null>(null);
  const [pin, setPin] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    socket.on('state_update', (t: Tournament | null) => {
      setTournament(t);
    });

    socket.on('error', (msg: string) => {
      console.error('Socket error:', msg);
    });

    // Failsafe polling
    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/tournament');
        if (response.ok) {
          const data = await response.json();
          setTournament(data);
        }
      } catch (err) {
        console.error('Polling failed:', err);
      }
    }, 30000);

    return () => {
      socket.off('state_update');
      socket.off('error');
      clearInterval(interval);
    };
  }, []);

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
        <Routes>
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
            isAuth ? (tournament ? <PlayoffDraft tournament={tournament} socket={socket} /> : <NoTournament onSetup={() => navigate('/admin')} />) : <Navigate to="/" />
          } />
          
          <Route path="/admin" element={
            isAuth ? <Setup tournament={tournament} /> : <Navigate to="/" />
          } />
        </Routes>
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
