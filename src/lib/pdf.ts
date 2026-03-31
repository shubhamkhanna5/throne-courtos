import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Tournament, Player, Round } from '../types';

export function generatePDF(tournament: Tournament) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('CourtOS Official Report', pageWidth / 2, 20, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(tournament.name, pageWidth / 2, 30, { align: 'center' });
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 38, { align: 'center' });

  // Leaderboard
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Current Leaderboard', 14, 55);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Ranking Priority: 1. Total Points, 2. Point Differential, 3. Total Points Scored', 14, 62);

  const sortedPlayers = [...tournament.players].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    return b.pointsScored - a.pointsScored;
  });

  const cutLine = 8;
  
  const tableData = sortedPlayers.map((p, i) => [
    i + 1,
    p.name + (i < cutLine ? ' (Q)' : ''),
    `#${p.jerseyNumber}`,
    p.points,
    p.pointDiff,
    p.pointsScored
  ]);

  autoTable(doc, {
    startY: 68,
    head: [['Rank', 'Player', 'Jersey', 'Points', 'Diff', 'Scored']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [20, 20, 20] },
    didParseCell: function(data) {
      if (data.section === 'body' && data.row.index < cutLine) {
        data.cell.styles.fontStyle = 'bold';
        if (data.column.index === 1) {
          data.cell.styles.textColor = [0, 128, 0]; // Green for qualified
        }
      }
    }
  });

  // Top 8 Qualified Section
  let currentY = (doc as any).lastAutoTable.finalY + 15;
  if (currentY > 250) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`QUALIFIED FOR PLAYOFFS (TOP ${cutLine})`, 14, currentY);
  currentY += 8;

  const top8 = sortedPlayers.slice(0, cutLine);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  top8.forEach((p, i) => {
    doc.text(`${i + 1}. ${p.name} (#${p.jerseyNumber}) - ${p.points} pts (${p.pointDiff > 0 ? '+' : ''}${p.pointDiff} diff)`, 20, currentY);
    currentY += 6;
  });

  // Round History
  currentY += 10;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Round History', 14, currentY);
  currentY += 10;

  tournament.rounds.forEach((round, idx) => {
    if (currentY > 250) {
      doc.addPage();
      currentY = 20;
    }
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Round ${round.number} (${round.type})`, 14, currentY);
    currentY += 8;

    round.pods.forEach(pod => {
      if (currentY > 260) {
        doc.addPage();
        currentY = 20;
      }
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`${pod.courtName} — Pod ${pod.podName}`, 14, currentY);
      currentY += 6;
      
      pod.matches.forEach(m => {
        const p1 = (tournament.players || []).find(p => p.id === m.playerIds[0])?.name;
        const p2 = (tournament.players || []).find(p => p.id === m.playerIds[1])?.name;
        const p3 = (tournament.players || []).find(p => p.id === m.playerIds[2])?.name;
        const p4 = (tournament.players || []).find(p => p.id === m.playerIds[3])?.name;
        
        doc.setFontSize(8);
        doc.text(`${p1}/${p2} vs ${p3}/${p4} — Result: ${m.score1}-${m.score2}`, 20, currentY);
        currentY += 4;
      });
      currentY += 4;
    });
    currentY += 10;
  });

  // Playoff Results
  if (tournament.playoffMatches && tournament.playoffMatches.length > 0) {
    if (currentY > 230) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Playoff Results', 14, currentY);
    currentY += 10;

    const semis = tournament.playoffMatches.filter(m => m.stage === 'SEMIS');
    const finals = tournament.playoffMatches.find(m => m.stage === 'FINALS');

    if (semis.length > 0) {
      doc.setFontSize(12);
      doc.text('Semi-Finals', 14, currentY);
      currentY += 8;

      semis.forEach(m => {
        const t1 = tournament.playoffTeams?.find(t => t.id === m.team1Id)?.name || 'TBD';
        const t2 = tournament.playoffTeams?.find(t => t.id === m.team2Id)?.name || 'TBD';
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${t1} vs ${t2} — Result: ${m.score1}-${m.score2}`, 20, currentY);
        currentY += 6;
      });
      currentY += 4;
    }

    if (finals) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Finals', 14, currentY);
      currentY += 8;

      const t1 = tournament.playoffTeams?.find(t => t.id === finals.team1Id)?.name || 'TBD';
      const t2 = tournament.playoffTeams?.find(t => t.id === finals.team2Id)?.name || 'TBD';
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`${t1} vs ${t2} — Result: ${finals.score1}-${finals.score2}`, 20, currentY);
      currentY += 6;

      if (finals.status === 'LOCKED') {
        const winner = finals.score1 > finals.score2 ? t1 : t2;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 128, 0);
        doc.text(`CHAMPIONS: ${winner}`, 14, currentY + 4);
        doc.setTextColor(0, 0, 0);
        currentY += 12;
      }
    }
  }

  doc.save(`${tournament.name.replace(/\s+/g, '_')}_Report.pdf`);
}
