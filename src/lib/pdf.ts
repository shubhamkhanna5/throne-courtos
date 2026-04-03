import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Tournament, Player, Round } from '../types';

export function generatePDF(tournament: Tournament) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header with a dark theme
  doc.setFillColor(20, 20, 20);
  doc.rect(0, 0, pageWidth, 50, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('COURT OS', pageWidth / 2, 25, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'italic');
  doc.text('OFFICIAL TOURNAMENT REPORT', pageWidth / 2, 35, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(tournament.name.toUpperCase(), pageWidth / 2, 42, { align: 'center' });

  // Reset text color
  doc.setTextColor(0, 0, 0);

  // Tournament Info
  doc.setFontSize(10);
  doc.text(`Status: ${tournament.status}`, 14, 60);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 60, { align: 'right' });

  // Leaderboard
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Final Standings', 14, 75);

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
    p.pointsScored,
    p.podWins
  ]);

  autoTable(doc, {
    startY: 82,
    head: [['Rank', 'Player', 'Jersey', 'Points', 'Diff', 'Scored', 'Pod Wins']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    didParseCell: function(data) {
      if (data.section === 'body' && data.row.index < cutLine) {
        if (data.column.index === 1) {
          data.cell.styles.textColor = [0, 100, 0]; // Dark green for qualified
        }
      }
    }
  });

  // Playoff Results (If available)
  if (tournament.playoffMatches && tournament.playoffMatches.length > 0) {
    let currentY = (doc as any).lastAutoTable.finalY + 20;
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
        doc.text(`${t1} vs ${t2}`, 20, currentY);
        doc.text(`${m.score1} - ${m.score2}`, pageWidth - 20, currentY, { align: 'right' });
        currentY += 6;
      });
      currentY += 4;
    }

    if (finals) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Championship Final', 14, currentY);
      currentY += 8;

      const t1 = tournament.playoffTeams?.find(t => t.id === finals.team1Id)?.name || 'TBD';
      const t2 = tournament.playoffTeams?.find(t => t.id === finals.team2Id)?.name || 'TBD';
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`${t1} vs ${t2}`, 20, currentY);
      doc.text(`${finals.score1} - ${finals.score2}`, pageWidth - 20, currentY, { align: 'right' });
      currentY += 10;

      if (finals.status === 'LOCKED') {
        const winner = finals.score1 > finals.score2 ? t1 : t2;
        doc.setFillColor(230, 255, 230);
        doc.rect(14, currentY - 2, pageWidth - 28, 15, 'F');
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 100, 0);
        doc.text(`CHAMPIONS: ${winner.toUpperCase()}`, pageWidth / 2, currentY + 8, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        currentY += 20;
      }
    }
  }

  // Footer on each page
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`CourtOS Tournament Management System // Page ${i} of ${totalPages}`, pageWidth / 2, 285, { align: 'center' });
  }

  doc.save(`${tournament.name.replace(/\s+/g, '_')}_Final_Report.pdf`);
}

export function generateScorecardsPDF(tournament: Tournament) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Create a page for each pod in each round
  (tournament.rounds || []).forEach((round) => {
    (round.pods || []).forEach((pod) => {
      doc.addPage();
      
      // Header
      doc.setFillColor(20, 20, 20);
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('OFFICIAL SCORECARD', pageWidth / 2, 15, { align: 'center' });
      
      doc.setFontSize(10);
      doc.text(`${tournament.name.toUpperCase()} // ${round.type} ROUND ${round.number}`, pageWidth / 2, 25, { align: 'center' });
      doc.text(`${pod.courtName.toUpperCase()} — POD ${pod.podName}`, pageWidth / 2, 32, { align: 'center' });
      
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      
      // Player List
      doc.text('PLAYERS IN THIS POD:', 14, 55);
      const podPlayers = (pod.playerIds || []).map(id => tournament.players.find(p => p.id === id));
      
      podPlayers.forEach((p, i) => {
        doc.setFont('helvetica', 'bold');
        doc.text(`${i + 1}. ${p?.name || 'Unknown'}`, 20, 65 + (i * 8));
        doc.setFont('helvetica', 'normal');
        doc.text(`(#${p?.jerseyNumber || '??'})`, 80, 65 + (i * 8));
      });

      // Match Grid
      let currentY = 110;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('MATCHES & RESULTS', 14, currentY);
      currentY += 10;

      (pod.matches || []).forEach((m, mIdx) => {
        const p1 = tournament.players.find(p => p.id === m.playerIds[0])?.name || 'P1';
        const p2 = tournament.players.find(p => p.id === m.playerIds[1])?.name || 'P2';
        const p3 = tournament.players.find(p => p.id === m.playerIds[2])?.name || 'P3';
        const p4 = tournament.players.find(p => p.id === m.playerIds[3])?.name || 'P4';

        // Match Box
        doc.setDrawColor(200, 200, 200);
        doc.rect(14, currentY, pageWidth - 28, 35);
        
        doc.setFontSize(10);
        doc.text(`MATCH ${mIdx + 1}`, 18, currentY + 8);
        
        // Team 1
        doc.setFontSize(11);
        doc.text(`${p1} & ${p2}`, 20, currentY + 18);
        doc.rect(pageWidth - 60, currentY + 12, 20, 10); // Score box 1
        
        doc.text('VS', pageWidth / 2 - 5, currentY + 25, { align: 'center' });
        
        // Team 2
        doc.text(`${p3} & ${p4}`, 20, currentY + 30);
        doc.rect(pageWidth - 60, currentY + 24, 20, 10); // Score box 2
        
        currentY += 45;
        
        if (currentY > pageHeight - 40 && mIdx < pod.matches.length - 1) {
          doc.addPage();
          currentY = 20;
        }
      });

      // Footer / Verification
      doc.setFontSize(8);
      doc.text('OPERATOR SIGNATURE: ___________________________', 14, pageHeight - 20);
      doc.text('DATE: ________________', pageWidth - 60, pageHeight - 20);
    });
  });

  // Remove the first empty page if any (jsPDF starts with one)
  doc.deletePage(1);
  
  doc.save(`${tournament.name.replace(/\s+/g, '_')}_Scorecards.pdf`);
}
