import { useState, useEffect, useRef } from 'react';
import socket from '../lib/socket';
import { Tournament, Pod, Match, Round, Player } from '../types';
import { Check, Lock, Unlock, ChevronLeft, ChevronRight, Save, Trophy, Loader2, Send, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface OperatorDeskProps {
  tournament: Tournament;
}

export default function OperatorDesk({ tournament }: OperatorDeskProps) {
  const isPlayoffs = tournament.status === 'PLAYOFFS';
  const currentRound = !isPlayoffs ? tournament.rounds[tournament.currentRoundIndex] : null;
  
  const [selectedPodId, setSelectedPodId] = useState<string | null>(null);
  const [selectedPlayoffMatchId, setSelectedPlayoffMatchId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, { s1: string, s2: string }>>({});
  const [activeInput, setActiveInput] = useState<{ matchId: string, side: 1 | 2 } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<'PODS' | 'SCORES'>('PODS');

  useEffect(() => {
    setIsLoading(false);
  }, [tournament]);

  useEffect(() => {
    if (!isPlayoffs && currentRound && !selectedPodId) {
      setSelectedPodId(currentRound.pods?.[0]?.id || null);
    } else if (isPlayoffs && (tournament.playoffMatches?.length || 0) > 0 && !selectedPlayoffMatchId) {
      const firstPending = (tournament.playoffMatches || []).find(m => m.status === 'PENDING');
      setSelectedPlayoffMatchId(firstPending?.id || tournament.playoffMatches?.[0]?.id || null);
    }
  }, [currentRound, selectedPodId, isPlayoffs, tournament.playoffMatches, selectedPlayoffMatchId]);

  const handlePodSelect = (id: string) => {
    setSelectedPodId(id);
    setView('SCORES');
  };

  const handlePlayoffMatchSelect = (id: string) => {
    setSelectedPlayoffMatchId(id);
    setView('SCORES');
  };

  const selectedPod = currentRound?.pods?.find(p => p.id === selectedPodId);
  const selectedPlayoffMatch = (tournament.playoffMatches || []).find(m => m.id === selectedPlayoffMatchId);

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

    // Auto-advance logic
    if (nextValue.length >= 2 || (parseInt(nextValue) >= 2 && nextValue.length >= 1)) {
      if (side === 1) {
        setActiveInput({ matchId, side: 2 });
      } else {
        if (!isPlayoffs) {
          const matchIdx = selectedPod?.matches.findIndex(m => m.id === matchId) ?? -1;
          if (matchIdx < 2) {
            const nextMatch = selectedPod?.matches[matchIdx + 1];
            setActiveInput({ matchId: nextMatch!.id, side: 1 });
          } else {
            setActiveInput(null);
          }
        } else {
          setActiveInput(null);
        }
      }
    }
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

  const handleSubmitPod = () => {
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

    setIsLoading(true);
    const matches = matchesWithScores.map(m => ({
      ...m,
      status: 'LOCKED' as const
    }));

    socket.emit('submit_score', {
      podId: selectedPod.id,
      matches
    });
    
    setScores({});
    setView('PODS');
  };

  const handleSubmitPlayoffMatch = () => {
    if (!selectedPlayoffMatch || isLoading) return;
    
    const s1 = parseInt(scores[selectedPlayoffMatch.id]?.s1 || '0');
    const s2 = parseInt(scores[selectedPlayoffMatch.id]?.s2 || '0');

    if (s1 === s2) {
      alert('Ties are not allowed in playoffs. Please enter a winning score.');
      return;
    }

    setIsLoading(true);
    socket.emit('submit_playoff_score', {
      matchId: selectedPlayoffMatch.id,
      score1: s1,
      score2: s2
    });

    setScores({});
    setSelectedPlayoffMatchId(null);
    setView('PODS');
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
    tournament.rounds.forEach(round => {
      round.pods.forEach(pod => {
        pod.matches.forEach(match => {
          const p1 = tournament.players.find(p => p.id === match.playerIds[0]);
          const p2 = tournament.players.find(p => p.id === match.playerIds[1]);
          const p3 = tournament.players.find(p => p.id === match.playerIds[2]);
          const p4 = tournament.players.find(p => p.id === match.playerIds[3]);
          
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
  if (isPlayoffs && (tournament.playoffMatches || []).length === 0) return <div className="text-center p-12 opacity-50">DRAFT IN PROGRESS...</div>;

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
          <button
            onClick={downloadResults}
            className="p-2 bg-surface-container-low border border-outline rounded-full hover:bg-surface-container transition-all text-on-surface"
            title="Download Results"
          >
            <Download className="w-5 h-5" />
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
            )}
            
            {/* Round Actions */}
            {!isPlayoffs && currentRound && (
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
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="scores"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {/* Score Entry Area */}
            <div className="lg:col-span-8">
              <div className="bg-surface rounded-3xl border border-outline overflow-hidden shadow-2xl">
                <div className="p-8 sm:p-12 space-y-12">
                  {!isPlayoffs ? (
                    (selectedPod?.matches || []).map((match, idx) => {
                      const p1 = (tournament.players || []).find(p => p.id === match.playerIds[0]);
                      const p2 = (tournament.players || []).find(p => p.id === match.playerIds[1]);
                      const p3 = (tournament.players || []).find(p => p.id === match.playerIds[2]);
                      const p4 = (tournament.players || []).find(p => p.id === match.playerIds[3]);

                      return (
                        <div key={match.id} className="space-y-6">
                          <div className="flex items-center gap-4">
                            <div className="h-px flex-1 bg-outline-variant opacity-30"></div>
                            <div className="text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest">Match {idx + 1}</div>
                            <div className="h-px flex-1 bg-outline-variant opacity-30"></div>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-12">
                            <div className="flex-1 text-center sm:text-right w-full">
                              <div className="text-lg font-black uppercase text-on-surface leading-tight">{p1?.name}</div>
                              <div className="text-lg font-black uppercase text-on-surface leading-tight">{p2?.name}</div>
                              <div className="text-[10px] font-mono text-on-surface-variant opacity-60 mt-1">#{p1?.jerseyNumber} + #{p2?.jerseyNumber}</div>
                            </div>

                            <div className="flex items-center gap-4">
                              <button 
                                onClick={() => setActiveInput({ matchId: match.id, side: 1 })}
                                className={`w-20 h-24 rounded-2xl border-4 flex items-center justify-center text-4xl font-mono font-black transition-all ${
                                  activeInput?.matchId === match.id && activeInput?.side === 1
                                    ? 'border-primary bg-primary text-on-primary scale-110 shadow-xl'
                                    : 'border-outline-variant bg-surface-container-lowest text-on-surface'
                                }`}
                              >
                                {scores[match.id]?.s1 || '0'}
                              </button>

                              <div className="text-2xl editorial-title text-on-surface-variant opacity-20 font-black italic">VS</div>

                              <button 
                                onClick={() => setActiveInput({ matchId: match.id, side: 2 })}
                                className={`w-20 h-24 rounded-2xl border-4 flex items-center justify-center text-4xl font-mono font-black transition-all ${
                                  activeInput?.matchId === match.id && activeInput?.side === 2
                                    ? 'border-primary bg-primary text-on-primary scale-110 shadow-xl'
                                    : 'border-outline-variant bg-surface-container-lowest text-on-surface'
                                }`}
                              >
                                {scores[match.id]?.s2 || '0'}
                              </button>
                            </div>

                            <div className="flex-1 text-center sm:text-left w-full">
                              <div className="text-lg font-black uppercase text-on-surface leading-tight">{p3?.name}</div>
                              <div className="text-lg font-black uppercase text-on-surface leading-tight">{p4?.name}</div>
                              <div className="text-[10px] font-mono text-on-surface-variant opacity-60 mt-1">#{p3?.jerseyNumber} + #{p4?.jerseyNumber}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : selectedPlayoffMatch && (
                    <div className="space-y-12 py-8">
                      <div className="flex flex-col sm:flex-row items-center gap-12">
                        <div className="flex-1 text-center sm:text-right w-full">
                          <div className="text-2xl font-black uppercase text-on-surface">{(tournament.playoffTeams || []).find(t => t.id === selectedPlayoffMatch.team1Id)?.name}</div>
                        </div>

                        <div className="flex items-center gap-4">
                          <button 
                            onClick={() => setActiveInput({ matchId: selectedPlayoffMatch.id, side: 1 })}
                            className={`w-24 h-32 rounded-2xl border-4 flex items-center justify-center text-5xl font-mono font-black transition-all ${
                              activeInput?.matchId === selectedPlayoffMatch.id && activeInput?.side === 1
                                ? 'border-primary bg-primary text-on-primary scale-110 shadow-xl'
                                : 'border-outline-variant bg-surface-container-lowest text-on-surface'
                            }`}
                          >
                            {scores[selectedPlayoffMatch.id]?.s1 || '0'}
                          </button>

                          <div className="text-3xl editorial-title text-on-surface-variant opacity-20 font-black italic">VS</div>

                          <button 
                            onClick={() => setActiveInput({ matchId: selectedPlayoffMatch.id, side: 2 })}
                            className={`w-24 h-32 rounded-2xl border-4 flex items-center justify-center text-5xl font-mono font-black transition-all ${
                              activeInput?.matchId === selectedPlayoffMatch.id && activeInput?.side === 2
                                ? 'border-primary bg-primary text-on-primary scale-110 shadow-xl'
                                : 'border-outline-variant bg-surface-container-lowest text-on-surface'
                            }`}
                          >
                            {scores[selectedPlayoffMatch.id]?.s2 || '0'}
                          </button>
                        </div>

                        <div className="flex-1 text-center sm:text-left w-full">
                          <div className="text-2xl font-black uppercase text-on-surface">{(tournament.playoffTeams || []).find(t => t.id === selectedPlayoffMatch.team2Id)?.name}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={isPlayoffs ? handleSubmitPlayoffMatch : handleSubmitPod}
                    disabled={isLoading || (!isPlayoffs && selectedPod?.status === 'LOCKED') || (isPlayoffs && selectedPlayoffMatch?.status === 'LOCKED')}
                    className={`w-full py-8 rounded-2xl flex items-center justify-center gap-4 font-black uppercase tracking-widest text-lg transition-all ${
                      isLoading ? 'bg-outline-variant cursor-not-allowed' : 'bg-primary text-on-primary hover:bg-primary-dim shadow-2xl hover:scale-[1.01]'
                    }`}
                  >
                    {isLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : <Send className="w-8 h-8" />}
                    {isLoading ? 'COMMITTING...' : isPlayoffs ? 'SUBMIT PLAYOFF SCORE' : 'LOCK & SUBMIT POD'}
                  </button>
                </div>
              </div>
            </div>

            {/* Numpad Area */}
            <div className="lg:col-span-4">
              <div className="bg-surface p-8 rounded-3xl border border-outline sticky top-24 shadow-xl space-y-8">
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        if (key === 'C') clearInput();
                        else if (key === 'OK') setActiveInput(null);
                        else handleNumpad(key.toString());
                      }}
                      className={`h-20 rounded-2xl flex items-center justify-center text-3xl font-black transition-all active:scale-95 ${
                        key === 'OK' ? 'bg-primary text-on-primary col-span-1' : 
                        key === 'C' ? 'bg-secondary text-on-secondary' : 
                        'bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant'
                      }`}
                    >
                      {key}
                    </button>
                  ))}
                </div>
                
                <div className="p-6 bg-surface-container-lowest border border-outline-variant rounded-2xl text-center space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50">Active Target</div>
                  <div className="text-sm font-mono font-bold text-on-surface">
                    {activeInput ? `MATCH ${!isPlayoffs ? selectedPod?.matches.findIndex(m => m.id === activeInput.matchId)! + 1 : 'PLAYOFF'} — SIDE ${activeInput.side}` : 'SELECT SCORE CELL'}
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
