import { generateScorecardsPDF, generatePDF } from '../lib/pdf';
import { useState, useEffect, useRef } from 'react';
import { Tournament, Pod, Match, Round, Player } from '../types';
import { tournamentService } from '../lib/tournamentService';
import { Check, Lock, Unlock, ChevronLeft, ChevronRight, Save, Trophy, Loader2, Send, Download, Clock, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface OperatorDeskProps {
  tournament: Tournament;
  onRefresh?: (silent?: boolean, newData?: Tournament) => void;
}

export default function OperatorDesk({ tournament, onRefresh }: OperatorDeskProps) {
  const isPlayoffs = tournament.status === 'PLAYOFFS';
  const currentRound = (!isPlayoffs && Array.isArray(tournament.rounds) && tournament.rounds.length > tournament.currentRoundIndex) 
    ? tournament.rounds[tournament.currentRoundIndex] 
    : null;
  
  const [selectedPodId, setSelectedPodId] = useState<string | null>(null);
  const [selectedPlayoffMatchId, setSelectedPlayoffMatchId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, { s1: string, s2: string }>>({});
  const [activeInput, setActiveInput] = useState<{ matchId: string, side: 1 | 2 } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [view, setView] = useState<'PODS' | 'SCORES'>('PODS');
  const scoreRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Load scores from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(`courtos_scores_${tournament.id}`);
    if (saved) {
      try {
        setScores(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved scores', e);
      }
    }
  }, [tournament.id]);

  // Save scores to localStorage whenever they change
  useEffect(() => {
    if (Object.keys(scores).length > 0) {
      localStorage.setItem(`courtos_scores_${tournament.id}`, JSON.stringify(scores));
    } else {
      localStorage.removeItem(`courtos_scores_${tournament.id}`);
    }
  }, [scores, tournament.id]);

  useEffect(() => {
    setIsLoading(false);
  }, [tournament]);

  useEffect(() => {
    if (!isPlayoffs && currentRound) {
      const podExists = currentRound.pods?.some(p => p.id === selectedPodId);
      if (!selectedPodId || !podExists) {
        setSelectedPodId(currentRound.pods?.[0]?.id || null);
      }
    } else if (isPlayoffs && (tournament.playoffMatches?.length || 0) > 0) {
      const matchExists = tournament.playoffMatches?.some(m => m.id === selectedPlayoffMatchId);
      if (!selectedPlayoffMatchId || !matchExists) {
        const firstPending = (tournament.playoffMatches || []).find(m => m.status === 'PENDING');
        setSelectedPlayoffMatchId(firstPending?.id || tournament.playoffMatches?.[0]?.id || null);
      }
    }
  }, [currentRound, selectedPodId, isPlayoffs, tournament.playoffMatches, selectedPlayoffMatchId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (view !== 'SCORES' || !activeInput) return;

      if (e.key >= '0' && e.key <= '9') {
        handleNumpad(e.key);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        advanceInput(activeInput.matchId, activeInput.side);
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'c' || e.key === 'C') {
        clearInput();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, activeInput, scores]);

  const handlePodSelect = (id: string) => {
    console.log('[OperatorDesk] Selecting pod:', id);
    setSelectedPodId(id);
    setView('SCORES');
  };

  const handlePlayoffMatchSelect = (id: string) => {
    console.log('[OperatorDesk] Selecting playoff match:', id);
    setSelectedPlayoffMatchId(id);
    setView('SCORES');
  };

  const selectedPod = currentRound?.pods?.find(p => p.id === selectedPodId);
  const selectedPlayoffMatch = (tournament.playoffMatches || []).find(m => m.id === selectedPlayoffMatchId);

  console.log('[OperatorDesk] Render state:', { 
    isPlayoffs, 
    view, 
    selectedPodId, 
    selectedPodMatches: selectedPod?.matches?.length,
    selectedPlayoffMatchId,
    selectedPlayoffMatch: !!selectedPlayoffMatch
  });

  const handleNumpad = (num: string) => {
    if (!activeInput) return;
    const { matchId, side } = activeInput;
    const current = scores[matchId]?.[side === 1 ? 's1' : 's2'] || '';
    const nextValue = current + num;
    
    const maxPoints = isPlayoffs ? 11 : 15;
    if (parseInt(nextValue) > maxPoints) return;

    setScores(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [side === 1 ? 's1' : 's2']: nextValue
      }
    }));

    // Auto-advance logic: 
    // 1. If it's 2 digits, it's definitely complete (max is 15 or 11)
    // 2. If it's 1 digit and that digit is > 1, it's complete because 20+ or 12+ is impossible
    const val = parseInt(nextValue);
    const isComplete = nextValue.length >= 2 || (nextValue.length === 1 && val > 1);
    
    if (isComplete) {
      advanceInput(matchId, side);
    }
  };

  const advanceInput = (matchId: string, side: number) => {
    let nextMatchId = matchId;
    let nextSide = side === 1 ? 2 : 1;

    if (side === 2) {
      if (!isPlayoffs && selectedPod) {
        const matchIdx = selectedPod.matches?.findIndex(m => m.id === matchId) ?? -1;
        if (matchIdx !== -1 && matchIdx < (selectedPod.matches?.length || 0) - 1) {
          const nextMatch = selectedPod.matches[matchIdx + 1];
          if (nextMatch) {
            nextMatchId = nextMatch.id;
            nextSide = 1;
          } else {
            setActiveInput(null);
            return;
          }
        } else {
          setActiveInput(null);
          return;
        }
      } else {
        setActiveInput(null);
        return;
      }
    }

    setActiveInput({ matchId: nextMatchId, side: nextSide as 1 | 2 });
    
    // Focus the next input
    const nextRefKey = `${nextMatchId}-${nextSide}`;
    setTimeout(() => {
      scoreRefs.current[nextRefKey]?.focus();
    }, 10);
  };

  const clearInput = () => {
    if (!activeInput) return;
    const { matchId, side } = activeInput;
    setScores(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [side === 1 ? 's1' : 's2']: ''
      }
    }));
  };

  const handleSubmitPod = async () => {
    if (!selectedPod || !currentRound || isLoading) return;
    
    // Validate no ties
    const matchesWithScores = (selectedPod.matches || []).map(m => ({
      ...m,
      score1: parseInt(scores[m.id]?.s1 || '0'),
      score2: parseInt(scores[m.id]?.s2 || '0')
    }));

    const hasTie = matchesWithScores.some(m => m.score1 === m.score2);
    if (hasTie) {
      alert('Ties are not allowed. Please enter a winning score for each match.');
      return;
    }

    const incompleteMatch = matchesWithScores.some(m => m.score1 < 15 && m.score2 < 15);
    if (incompleteMatch) {
      alert('Each match must have a winner with 15 points.');
      return;
    }

    setIsLoading(true);
    const matches = matchesWithScores.map(m => ({
      ...m,
      status: 'LOCKED' as const
    }));

    // Optimistic UI: Transition back immediately
    const previousScores = { ...scores };
    setScores({});
    setView('PODS');

    try {
      const updated = await tournamentService.submitScore(selectedPod.id, matches, tournament.id);
      // Success! Realtime will handle the rest, but we update immediately for speed
      onRefresh?.(true, updated);
    } catch (err) {
      console.error('Submit score error:', err);
      // Revert on error
      setScores(previousScores);
      setSelectedPodId(selectedPod.id);
      setView('SCORES');
      alert('Failed to submit scores. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitPlayoffMatch = async () => {
    if (!selectedPlayoffMatch || isLoading) return;
    
    const s1 = parseInt(scores[selectedPlayoffMatch.id]?.s1 || '0');
    const s2 = parseInt(scores[selectedPlayoffMatch.id]?.s2 || '0');

    if (s1 === s2) {
      alert('Ties are not allowed in playoffs. Please enter a winning score.');
      return;
    }

    if (s1 < 11 && s2 < 11) {
      alert('The match must have a winner with 11 points.');
      return;
    }

    setIsLoading(true);
    const previousScores = { ...scores };
    const matchId = selectedPlayoffMatch.id;
    
    // Optimistic UI: Transition back immediately
    setScores({});
    setSelectedPlayoffMatchId(null);
    setView('PODS');

    try {
      const updated = await tournamentService.submitPlayoffScore(matchId, s1, s2);
      // Success!
      onRefresh?.(true, updated);
    } catch (err) {
      console.error('Submit playoff score error:', err);
      // Revert on error
      setScores(previousScores);
      setSelectedPlayoffMatchId(matchId);
      setView('SCORES');
      alert('Failed to submit playoff score. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const [showAdvanceConfirm, setShowAdvanceConfirm] = useState(false);

  const handleAdvanceRound = async () => {
    if (!tournament || isAdvancing) return;
    
    let message = '';
    if (tournament.status === 'SEEDING') message = 'Advance to Round 2 (Ladder)?';
    else if (tournament.status === 'LADDER') {
      if (tournament.currentRoundIndex < 3) message = `Advance to Round ${tournament.currentRoundIndex + 2}?`;
      else message = 'Advance to Playoff Draft?';
    } else if (tournament.status === 'PLAYOFFS') {
      message = 'Generate Playoff Bracket?';
    }

    const allPodsLocked = !currentRound || currentRound.pods?.every(p => p.status === 'LOCKED');
    if (!allPodsLocked && !showAdvanceConfirm) {
      setShowAdvanceConfirm(true);
      return;
    }

    if (!window.confirm(message || 'Advance to the next stage?')) return;

    setIsAdvancing(true);
    try {
      await tournamentService.advanceRound(tournament.id);
      setShowAdvanceConfirm(false);
      onRefresh?.();
    } catch (err) {
      console.error('Advance round error:', err);
      alert('Failed to advance round. Please try again.');
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleResetTournament = async () => {
    if (!tournament || isLoading) return;
    if (!window.confirm('WARNING: This will delete ALL scores and reset the tournament to SETUP. Are you sure?')) return;

    setIsLoading(true);
    try {
      await tournamentService.resetTournament(tournament.id);
      onRefresh?.();
    } catch (err) {
      console.error('Reset tournament error:', err);
      alert('Failed to reset tournament.');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadRoundAssignments = () => {
    if (!currentRound) return;
    const doc = new jsPDF();
    const tournamentName = tournament.name || 'Tournament';
    const roundTitle = `${currentRound.type} Round ${currentRound.number}`;
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(0, 0, 0);
    doc.text(tournamentName, 14, 22);
    doc.setFontSize(14);
    doc.text(roundTitle + ' Assignments', 14, 32);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 40);

    // Pod Assignments
    let currentY = 50;
    
    currentRound.pods.forEach((pod) => {
      if (currentY > 240) {
        doc.addPage();
        currentY = 20;
      }
      
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'bold');
      doc.text(`${pod.courtName} - Pod ${pod.podName}`, 14, currentY);
      doc.setFont(undefined, 'normal');
      currentY += 5;
      
      const podPlayers = pod.playerIds.map(id => {
        const p = tournament.players.find(player => player.id === id);
        return [p?.name || 'Unknown', p?.jerseyNumber || '-', p?.duprId || '-'];
      });
      
      autoTable(doc, {
        startY: currentY,
        head: [['Player Name', 'Jersey #', 'DUPR ID']],
        body: podPlayers,
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255] },
        margin: { left: 14 },
        tableWidth: 180
      });
      
      currentY = (doc as any).lastAutoTable.finalY + 15;
    });

    doc.save(`${tournamentName.replace(/\s+/g, '_')}_${roundTitle.replace(/\s+/g, '_')}_Assignments.pdf`);
  };

  const downloadScorecards = () => {
    if (!tournament) return;
    generateScorecardsPDF(tournament);
  };

  const downloadResults = () => {
    const doc = new jsPDF();
    const tournamentName = tournament.name || 'Tournament Results';
    
    // Header
    doc.setFontSize(20);
    doc.text(tournamentName, 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Status: ${tournament.status}`, 14, 35);

    // Player Standings
    doc.setFontSize(14);
    doc.text('Final Standings', 14, 45);
    
    const sortedPlayers = [...(tournament.players || [])].sort((a, b) => (a.rank || 0) - (b.rank || 0));
    
    autoTable(doc, {
      startY: 50,
      head: [['Rank', 'Player', 'DUPR', 'Phone', 'Email', 'Jersey', 'Points', 'Diff']],
      body: sortedPlayers.map(p => [
        p.rank || '-',
        p.name,
        p.duprId || '-',
        p.phone || '-',
        p.email || '-',
        p.jerseyNumber,
        p.points,
        p.pointDiff
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255] }
    });

    let currentY = (doc as any).lastAutoTable.finalY + 10;

    // Playoff Bracket (Prioritize on first page if possible)
    if (tournament.playoffMatches && tournament.playoffMatches.length > 0) {
      if (currentY > 200) {
        doc.addPage();
        currentY = 20;
      }
      doc.setFontSize(14);
      doc.text('Playoff Bracket', 14, currentY);
      currentY += 10;

      const semis = tournament.playoffMatches.filter(m => m.stage === 'SEMIS');
      const finals = tournament.playoffMatches.find(m => m.stage === 'FINALS');

      // Draw simple bracket
      doc.setFontSize(8);
      semis.forEach((m, i) => {
        const t1 = tournament.playoffTeams?.find(t => t.id === m.team1Id)?.name || 'TBD';
        const t2 = tournament.playoffTeams?.find(t => t.id === m.team2Id)?.name || 'TBD';
        const y = currentY + (i * 30);
        
        doc.rect(14, y, 50, 15);
        doc.text(`${t1}: ${m.score1}`, 16, y + 6);
        doc.text(`${t2}: ${m.score2}`, 16, y + 12);
        
        // Connector
        doc.line(64, y + 7.5, 74, y + 7.5);
        if (i === 0) doc.line(74, y + 7.5, 74, y + 22.5);
        else doc.line(74, y + 7.5, 74, y - 7.5);
      });

      if (finals) {
        const t1 = tournament.playoffTeams?.find(t => t.id === finals.team1Id)?.name || 'TBD';
        const t2 = tournament.playoffTeams?.find(t => t.id === finals.team2Id)?.name || 'TBD';
        const y = currentY + 15;
        doc.rect(74, y, 60, 20);
        doc.setFontSize(10);
        doc.text('FINALS', 76, y + 5);
        doc.setFontSize(8);
        doc.text(`${t1}: ${finals.score1}`, 76, y + 12);
        doc.text(`${t2}: ${finals.score2}`, 76, y + 18);
        
        if (finals.status === 'LOCKED') {
          const winner = finals.score1 > finals.score2 ? t1 : t2;
          doc.setFontSize(12);
          doc.text(`CHAMPION: ${winner}`, 140, y + 12);
        }
      }
      currentY += 60;
    }

    // Match History (Move to end/new page)
    if (currentY > 200) {
      doc.addPage();
      currentY = 20;
    } else {
      currentY += 10;
    }
    
    doc.setFontSize(14);
    doc.text('Match History', 14, currentY);
    currentY += 5;

    const matchData: any[] = [];
    (tournament.rounds || []).forEach(round => {
      (round.pods || []).forEach(pod => {
        (pod.matches || []).forEach(match => {
          const p1 = (tournament.players || []).find(p => p.id === match.playerIds[0]);
          const p2 = (tournament.players || []).find(p => p.id === match.playerIds[1]);
          const p3 = (tournament.players || []).find(p => p.id === match.playerIds[2]);
          const p4 = (tournament.players || []).find(p => p.id === match.playerIds[3]);
          
          matchData.push([
            `R${round.number}`,
            pod.courtName,
            `${p1?.name}/${p2?.name}`,
            `${match.score1}-${match.score2}`,
            `${p3?.name}/${p4?.name}`,
            match.status
          ]);
        });
      });
    });

    autoTable(doc, {
      startY: currentY,
      head: [['Round', 'Court', 'Team 1', 'Score', 'Team 2', 'Status']],
      body: matchData,
      styles: { fontSize: 7 },
    });

    doc.save(`${tournamentName.replace(/\s+/g, '_')}_Results.pdf`);
  };

  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  const handleFinishTournament = async () => {
    if (!tournament || isLoading) return;
    if (!window.confirm('Finalize tournament and lock all scores? This will generate the final report.')) return;
    
    setIsLoading(true);
    try {
      console.log('[OperatorDesk] Finishing tournament:', tournament.id);
      await tournamentService.finishTournament(tournament.id);
      generatePDF(tournament);
      setShowFinishConfirm(false);
      onRefresh?.();
    } catch (err) {
      console.error('Finish tournament error:', err);
      alert('Failed to finish tournament.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartNewTournament = () => {
    localStorage.removeItem('courtos_current_tournament_id');
    window.location.href = '/admin';
  };

  if ((tournament.status as any) === 'FINISHED') {
    return (
      <div className="flex flex-col items-center justify-center p-24 text-center space-y-6">
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center">
          <Trophy className="w-12 h-12 text-green-600" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-serif italic font-bold">Tournament Complete</h2>
          <p className="text-gray-500 max-w-xs mx-auto">The event has been finalized. You can download the results or start a new tournament.</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={downloadResults}
            className="px-8 py-3 bg-surface border border-outline rounded-xl font-bold hover:bg-surface-container transition-all flex items-center gap-2"
          >
            <Download className="w-5 h-5" />
            Results PDF
          </button>
          <button 
            onClick={downloadScorecards}
            className="px-8 py-3 bg-surface border border-outline rounded-xl font-bold hover:bg-surface-container transition-all flex items-center gap-2"
          >
            <Download className="w-5 h-5" />
            Scorecards PDF
          </button>
          <button 
            onClick={handleStartNewTournament}
            className="px-8 py-3 bg-primary text-on-primary rounded-xl font-bold hover:bg-primary-dim transition-all shadow-lg"
          >
            Start New Tournament
          </button>
        </div>
      </div>
    );
  }

  if (!isPlayoffs && !currentRound) {
    return (
      <div className="flex flex-col items-center justify-center p-24 text-center space-y-6">
        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center">
          <Trophy className="w-12 h-12 text-gray-300" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-serif italic font-bold">No Active Round</h2>
          <p className="text-gray-500 max-w-xs mx-auto">The tournament has not been started yet or is currently being seeded. Head to the Admin tab to initialize the event.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Header / Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {view === 'SCORES' && (
            <button 
              onClick={() => setView('PODS')}
              className="p-2 bg-surface-container-low border border-outline rounded-full hover:bg-surface-container transition-all"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <div>
            <h2 className="text-2xl editorial-title font-black text-on-surface">
              {view === 'PODS' ? 'Operator Desk' : (isPlayoffs ? 'Playoff Entry' : 'Pod Entry')}
            </h2>
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
              {view === 'PODS' ? (isPlayoffs ? 'Select Bracket Match' : `Select Pod — Round ${currentRound?.number}`) : (isPlayoffs ? selectedPlayoffMatch?.stage : `${selectedPod?.courtName} — Pod ${selectedPod?.podName}`)}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {(tournament.status as any) === 'FINISHED' ? (
            <button
              onClick={handleStartNewTournament}
              className="px-6 py-2 rounded-full font-black uppercase tracking-widest text-xs transition-all shadow-lg flex items-center gap-2 bg-green-600 text-white hover:bg-green-700"
            >
              <RotateCcw className="w-4 h-4" />
              Start New Tournament
            </button>
          ) : showFinishConfirm ? (
            <div className="flex gap-2 items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-red-600">End Event?</span>
              <button
                onClick={handleFinishTournament}
                disabled={isLoading}
                className="px-4 py-2 rounded-full font-black uppercase tracking-widest text-[10px] transition-all shadow-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes, End'}
              </button>
              <button
                onClick={() => setShowFinishConfirm(false)}
                disabled={isLoading}
                className="px-4 py-2 rounded-full font-black uppercase tracking-widest text-[10px] transition-all shadow-lg bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowFinishConfirm(true)}
              disabled={isLoading}
              className="px-6 py-2 rounded-full font-black uppercase tracking-widest text-xs transition-all shadow-lg flex items-center gap-2 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              End Tournament
            </button>
          )}

          {((!isPlayoffs && currentRound) || (isPlayoffs && (tournament.playoffMatches || []).length === 0)) && (tournament.status as any) !== 'FINISHED' && (
            <div className="flex gap-2 items-center">
              {showAdvanceConfirm && (
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">Pods not locked. Proceed?</span>
              )}
              <button
                onClick={handleAdvanceRound}
                disabled={isAdvancing}
                className={`px-6 py-2 rounded-full font-black uppercase tracking-widest text-xs transition-all shadow-lg flex items-center gap-2 ${
                  isAdvancing ? 'bg-outline-variant cursor-not-allowed' : 
                  showAdvanceConfirm ? 'bg-amber-600 text-white hover:bg-amber-700' :
                  'bg-primary text-on-primary hover:bg-primary-dim'
                }`}
              >
                {isAdvancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {showAdvanceConfirm ? 'Yes, Advance' : 
                 tournament.status === 'SEEDING' ? 'Complete Seeding' : 
                 tournament.status === 'PLAYOFFS' ? 'Start Playoff Matches' :
                 tournament.currentRoundIndex === 3 ? 'Choose Team Mates' : 
                 `Complete Ladder ${tournament.currentRoundIndex}`}
              </button>
              {showAdvanceConfirm && (
                <button
                  onClick={() => setShowAdvanceConfirm(false)}
                  className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"
                >
                  <RotateCcw className="w-4 h-4 text-gray-600" />
                </button>
              )}
            </div>
          )}
          <button
            onClick={downloadResults}
            className="p-2 bg-surface-container-low border border-outline rounded-full hover:bg-surface-container transition-all text-on-surface"
            title="Download Results"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={downloadScorecards}
            className="p-2 bg-surface-container-low border border-outline rounded-full hover:bg-surface-container transition-all text-on-surface"
            title="Download Scorecards"
          >
            <Clock className="w-5 h-5" />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === 'PODS' ? (
          <motion.div 
            key="pods"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {!isPlayoffs ? (
              (currentRound?.pods || []).map((pod) => (
                <button
                  key={pod.id}
                  onClick={() => handlePodSelect(pod.id)}
                  className={`p-6 rounded-2xl flex flex-col items-center justify-center border-2 transition-all space-y-4 ${
                    pod.status === 'LOCKED' 
                      ? 'bg-surface-container-lowest border-outline-variant opacity-60' 
                      : 'bg-surface border-outline hover:border-primary hover:scale-[1.02] shadow-sm hover:shadow-md'
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center">
                    {pod.status === 'LOCKED' ? <Lock className="w-6 h-6 text-on-surface-variant" /> : <Unlock className="w-6 h-6 text-primary" />}
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] uppercase font-black tracking-widest text-on-surface-variant mb-1">{pod.courtName}</div>
                    <div className="text-3xl editorial-title font-black">Pod {pod.podName}</div>
                  </div>
                  {pod.status === 'LOCKED' && (
                    <div className="text-[10px] font-mono font-bold text-on-surface-variant uppercase">Completed</div>
                  )}
                </button>
              ))
            ) : (
              (tournament.playoffMatches || []).length > 0 ? (
                (tournament.playoffMatches || []).map((match) => {
                  const t1 = (tournament.playoffTeams || []).find(t => t.id === match.team1Id);
                  const t2 = (tournament.playoffTeams || []).find(t => t.id === match.team2Id);
                  return (
                    <button
                      key={match.id}
                      onClick={() => handlePlayoffMatchSelect(match.id)}
                      className={`p-6 rounded-2xl flex flex-col items-center justify-center border-2 transition-all space-y-4 ${
                        match.status === 'LOCKED' 
                          ? 'bg-surface-container-lowest border-outline-variant opacity-60' 
                          : 'bg-surface border-outline hover:border-primary hover:scale-[1.02] shadow-sm hover:shadow-md'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center">
                        {match.status === 'LOCKED' ? <Lock className="w-6 h-6 text-on-surface-variant" /> : <Trophy className="w-6 h-6 text-primary" />}
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] uppercase font-black tracking-widest text-on-surface-variant mb-1">{match.stage}</div>
                        <div className="text-xl font-black">{t1?.name || 'TBD'} vs {t2?.name || 'TBD'}</div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="col-span-full py-24 text-center space-y-4 opacity-50">
                  <Clock className="w-12 h-12 mx-auto" />
                  <div className="text-xl font-black uppercase tracking-widest">Draft in Progress</div>
                  <p className="text-sm max-w-xs mx-auto">Playoff matches will appear here once the draft is finalized and matches are generated.</p>
                </div>
              )
            )}
            
            {/* Round Actions */}
            {!isPlayoffs && currentRound && (
              <>
                <button
                  onClick={downloadRoundAssignments}
                  className="p-6 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low transition-all space-y-4"
                >
                  <div className="w-12 h-12 rounded-full bg-tertiary/10 flex items-center justify-center">
                    <Download className="w-6 h-6 text-tertiary" />
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] uppercase font-black tracking-widest text-on-surface-variant mb-1">Assignments</div>
                    <div className="text-xl editorial-title font-black">Get PDF</div>
                  </div>
                </button>
                <button
                  onClick={handleResetTournament}
                  className="p-6 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-error/30 bg-error/5 hover:bg-error/10 transition-all space-y-4"
                >
                  <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center">
                    <RotateCcw className="w-6 h-6 text-error" />
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] uppercase font-black tracking-widest text-error/70 mb-1">Danger Zone</div>
                    <div className="text-xl editorial-title font-black text-error">Reset All</div>
                  </div>
                </button>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="scores"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-8"
          >
            {/* Score Entry Area */}
            <div className="lg:col-span-8 order-2 lg:order-1">
              <div className="bg-surface rounded-3xl border border-outline overflow-hidden shadow-2xl">
                <div className="p-4 sm:p-8 lg:p-12 space-y-8 sm:space-y-12">
                  {!isPlayoffs ? (
                    (selectedPod?.matches || []).map((match, idx) => {
                      const p1 = (tournament.players || []).find(p => p.id === match.playerIds[0]);
                      const p2 = (tournament.players || []).find(p => p.id === match.playerIds[1]);
                      const p3 = (tournament.players || []).find(p => p.id === match.playerIds[2]);
                      const p4 = (tournament.players || []).find(p => p.id === match.playerIds[3]);

                      return (
                        <div key={match.id} className="space-y-4 sm:space-y-6">
                          <div className="flex items-center gap-4">
                            <div className="h-px flex-1 bg-outline-variant opacity-30"></div>
                            <div className="text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest">Match {idx + 1}</div>
                            <div className="h-px flex-1 bg-outline-variant opacity-30"></div>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-12">
                            <div className="flex-1 flex items-center justify-end gap-3 sm:gap-4 w-full">
                              <div className="text-right">
                                <div className="text-sm sm:text-lg font-black uppercase text-on-surface leading-tight">{p1?.name}</div>
                                <div className="text-sm sm:text-lg font-black uppercase text-on-surface leading-tight">{p2?.name}</div>
                                <div className="text-[8px] sm:text-[10px] font-mono text-on-surface-variant opacity-60 mt-0.5">#{p1?.jerseyNumber} + #{p2?.jerseyNumber}</div>
                              </div>
                              <div className="flex -space-x-3 sm:-space-x-4">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-surface-container-high border-2 border-surface flex items-center justify-center text-[8px] sm:text-[10px] font-black text-on-surface-variant">#{p1?.jerseyNumber}</div>
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-surface-container-high border-2 border-surface flex items-center justify-center text-[8px] sm:text-[10px] font-black text-on-surface-variant">#{p2?.jerseyNumber}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 sm:gap-4">
                              <button 
                                ref={el => { scoreRefs.current[`${match.id}-1`] = el; }}
                                onClick={() => setActiveInput({ matchId: match.id, side: 1 })}
                                onFocus={() => setActiveInput({ matchId: match.id, side: 1 })}
                                className={`w-16 h-20 sm:w-20 sm:h-24 rounded-2xl border-4 flex items-center justify-center text-3xl sm:text-4xl font-mono font-black transition-all ${
                                  activeInput?.matchId === match.id && activeInput?.side === 1
                                    ? 'border-indigo-600 bg-indigo-600 text-white scale-110 shadow-xl'
                                    : 'border-outline-variant bg-surface-container-lowest text-on-surface'
                                }`}
                              >
                                {scores[match.id]?.s1 || '0'}
                              </button>

                              <div className="text-xl sm:text-2xl editorial-title text-on-surface-variant opacity-20 font-black italic">VS</div>

                              <button 
                                ref={el => { scoreRefs.current[`${match.id}-2`] = el; }}
                                onClick={() => setActiveInput({ matchId: match.id, side: 2 })}
                                onFocus={() => setActiveInput({ matchId: match.id, side: 2 })}
                                className={`w-16 h-20 sm:w-20 sm:h-24 rounded-2xl border-4 flex items-center justify-center text-3xl sm:text-4xl font-mono font-black transition-all ${
                                  activeInput?.matchId === match.id && activeInput?.side === 2
                                    ? 'border-rose-600 bg-rose-600 text-white scale-110 shadow-xl'
                                    : 'border-outline-variant bg-surface-container-lowest text-on-surface'
                                }`}
                              >
                                {scores[match.id]?.s2 || '0'}
                              </button>
                            </div>

                            <div className="flex-1 flex items-center justify-start gap-3 sm:gap-4 w-full">
                              <div className="flex -space-x-3 sm:-space-x-4">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-surface-container-high border-2 border-surface flex items-center justify-center text-[8px] sm:text-[10px] font-black text-on-surface-variant">#{p3?.jerseyNumber}</div>
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-surface-container-high border-2 border-surface flex items-center justify-center text-[8px] sm:text-[10px] font-black text-on-surface-variant">#{p4?.jerseyNumber}</div>
                              </div>
                              <div className="text-left">
                                <div className="text-sm sm:text-lg font-black uppercase text-on-surface leading-tight">{p3?.name}</div>
                                <div className="text-sm sm:text-lg font-black uppercase text-on-surface leading-tight">{p4?.name}</div>
                                <div className="text-[8px] sm:text-[10px] font-mono text-on-surface-variant opacity-60 mt-0.5">#{p3?.jerseyNumber} + #{p4?.jerseyNumber}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : selectedPlayoffMatch && (
                    <div className="space-y-8 sm:space-y-12 py-4 sm:py-8">
                      <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-12">
                        <div className="flex-1 text-center sm:text-right w-full">
                          <div className="text-xl sm:text-2xl font-black uppercase text-on-surface">{(tournament.playoffTeams || []).find(t => t.id === selectedPlayoffMatch.team1Id)?.name}</div>
                        </div>

                        <div className="flex items-center gap-4">
                          <button 
                            ref={el => { scoreRefs.current[`${selectedPlayoffMatch.id}-1`] = el; }}
                            onClick={() => setActiveInput({ matchId: selectedPlayoffMatch.id, side: 1 })}
                            onFocus={() => setActiveInput({ matchId: selectedPlayoffMatch.id, side: 1 })}
                            className={`w-20 h-28 sm:w-24 sm:h-32 rounded-2xl border-4 flex items-center justify-center text-4xl sm:text-5xl font-mono font-black transition-all ${
                              activeInput?.matchId === selectedPlayoffMatch.id && activeInput?.side === 1
                                ? 'border-indigo-600 bg-indigo-600 text-white scale-110 shadow-xl'
                                : 'border-outline-variant bg-surface-container-lowest text-on-surface'
                            }`}
                          >
                            {scores[selectedPlayoffMatch.id]?.s1 || '0'}
                          </button>

                          <div className="text-2xl sm:text-3xl editorial-title text-on-surface-variant opacity-20 font-black italic">VS</div>

                          <button 
                            ref={el => { scoreRefs.current[`${selectedPlayoffMatch.id}-2`] = el; }}
                            onClick={() => setActiveInput({ matchId: selectedPlayoffMatch.id, side: 2 })}
                            onFocus={() => setActiveInput({ matchId: selectedPlayoffMatch.id, side: 2 })}
                            className={`w-20 h-28 sm:w-24 sm:h-32 rounded-2xl border-4 flex items-center justify-center text-4xl sm:text-5xl font-mono font-black transition-all ${
                              activeInput?.matchId === selectedPlayoffMatch.id && activeInput?.side === 2
                                ? 'border-rose-600 bg-rose-600 text-white scale-110 shadow-xl'
                                : 'border-outline-variant bg-surface-container-lowest text-on-surface'
                            }`}
                          >
                            {scores[selectedPlayoffMatch.id]?.s2 || '0'}
                          </button>
                        </div>

                        <div className="flex-1 text-center sm:text-left w-full">
                          <div className="text-xl sm:text-2xl font-black uppercase text-on-surface">{(tournament.playoffTeams || []).find(t => t.id === selectedPlayoffMatch.team2Id)?.name}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={isPlayoffs ? handleSubmitPlayoffMatch : handleSubmitPod}
                    disabled={isLoading || (!isPlayoffs && selectedPod?.status === 'LOCKED') || (isPlayoffs && selectedPlayoffMatch?.status === 'LOCKED')}
                    className={`w-full py-6 sm:py-8 rounded-2xl flex items-center justify-center gap-4 font-black uppercase tracking-widest text-base sm:text-lg transition-all ${
                      isLoading ? 'bg-outline-variant cursor-not-allowed' : 'bg-primary text-on-primary hover:bg-primary-dim shadow-2xl hover:scale-[1.01]'
                    }`}
                  >
                    {isLoading ? <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin" /> : <Send className="w-6 h-6 sm:w-8 sm:h-8" />}
                    {isLoading ? 'COMMITTING...' : isPlayoffs ? 'SUBMIT PLAYOFF SCORE' : 'LOCK & SUBMIT POD'}
                  </button>
                </div>
              </div>
            </div>

            {/* Numpad Area */}
            <div className="lg:col-span-4 order-1 lg:order-2">
              <div className="bg-surface p-4 sm:p-8 rounded-3xl border border-outline lg:sticky lg:top-24 shadow-xl space-y-4 sm:space-y-8">
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'NEXT'].map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        if (key === 'C') clearInput();
                        else if (key === 'NEXT') {
                          if (activeInput) advanceInput(activeInput.matchId, activeInput.side);
                        }
                        else handleNumpad(key.toString());
                      }}
                      className={`h-16 sm:h-20 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl font-black transition-all active:scale-95 ${
                        key === 'NEXT' ? 'bg-primary text-on-primary col-span-1 text-base sm:text-xl' : 
                        key === 'C' ? 'bg-secondary text-on-secondary' : 
                        'bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant'
                      }`}
                    >
                      {key}
                    </button>
                  ))}
                </div>
                
                <div className="p-4 sm:p-6 bg-surface-container-lowest border border-outline-variant rounded-2xl text-center space-y-1 sm:space-y-2">
                  <div className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50">Active Target</div>
                  <div className="text-xs sm:text-sm font-mono font-bold text-on-surface">
                    {activeInput ? (
                      isPlayoffs ? `PLAYOFF MATCH — SIDE ${activeInput.side}` : (
                        (() => {
                          const idx = (selectedPod?.matches || []).findIndex(m => m.id === activeInput.matchId);
                          return `MATCH ${idx !== -1 ? idx + 1 : '?'} — SIDE ${activeInput.side}`;
                        })()
                      )
                    ) : 'SELECT A SCORE INPUT'}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
