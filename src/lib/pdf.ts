import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Tournament, Player, Round } from '../types';

export function generateTournamentResultsPDF(tournament: Tournament) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Premium Header
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, pageWidth, 50, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('COURT OS', 14, 25);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('OFFICIAL TOURNAMENT REPORT', 14, 32);
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(tournament.name.toUpperCase(), pageWidth - 14, 25, { align: 'right' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`STATUS: ${tournament.status}`, pageWidth - 14, 32, { align: 'right' });

  // 2. Metadata Bar
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.setFontSize(8);
  doc.text(`GENERATED: ${new Date().toLocaleString()}`, 14, 60);
  doc.text(`TOURNAMENT ID: ${tournament.id}`, pageWidth - 14, 60, { align: 'right' });
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.line(14, 65, pageWidth - 14, 65);

  // 3. Final Ladder Rankings
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Final Ladder Rankings', 14, 80);

  const sortedPlayers = [...(tournament.players || [])].sort((a, b) => (a.rank || 999) - (b.rank || 999));
  
  // Calculate Performance Rank
  const performanceSorted = [...(tournament.players || [])].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    return b.pointsScored - a.pointsScored;
  });
  const performanceRankMap = new Map(performanceSorted.map((p, i) => [p.id, i + 1]));

  const cutLine = 8;
  
  const tableData = sortedPlayers.map((p, i) => [
    i + 1,
    `#${performanceRankMap.get(p.id)}`,
    p.name + (i < cutLine ? ' (Q)' : ''),
    `#${p.jerseyNumber}`,
    p.points,
    p.pointDiff,
    p.pointsScored
  ]);

  autoTable(doc, {
    startY: 85,
    head: [['Ladder Pos', 'Perf Rank', 'Player', 'Jersey', 'Points', 'Diff', 'Scored']],
    body: tableData,
    theme: 'striped',
    headStyles: { 
      fillColor: [15, 23, 42], 
      textColor: [255, 255, 255], 
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center'
    },
    bodyStyles: { 
      fontSize: 8,
      halign: 'center'
    },
    columnStyles: {
      2: { halign: 'left', fontStyle: 'bold' }
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: function(data) {
      if (data.section === 'body' && data.row.index < cutLine) {
        if (data.column.index === 2) {
          data.cell.styles.textColor = [34, 197, 94]; // Green 500
        }
      }
    }
  });

  let currentY = (doc as any).lastAutoTable.finalY + 20;

  // 4. Playoff Bracket
  if (tournament.playoffMatches && tournament.playoffMatches.length > 0) {
    if (currentY > 200) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Playoff Bracket', 14, currentY);
    currentY += 15;

    const semis = tournament.playoffMatches.filter(m => m.stage === 'SEMIS');
    const finals = tournament.playoffMatches.find(m => m.stage === 'FINALS');

    // Draw Bracket
    const boxWidth = 65;
    const boxHeight = 22;
    const verticalGap = 45;
    const horizontalGap = 35;

    semis.forEach((m, i) => {
      const t1 = tournament.playoffTeams?.find(t => t.id === m.team1Id)?.name || 'TBD';
      const t2 = tournament.playoffTeams?.find(t => t.id === m.team2Id)?.name || 'TBD';
      const y = currentY + (i * verticalGap);
      
      doc.setDrawColor(203, 213, 225);
      doc.setFillColor(255, 255, 255);
      doc.rect(14, y, boxWidth, boxHeight, 'FD');
      
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`SEMI-FINAL ${i + 1}`, 16, y + 5);
      
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', m.score1 > m.score2 ? 'bold' : 'normal');
      doc.text(t1, 16, y + 12);
      doc.text(m.score1.toString(), 14 + boxWidth - 5, y + 12, { align: 'right' });
      
      doc.setFont('helvetica', m.score2 > m.score1 ? 'bold' : 'normal');
      doc.text(t2, 16, y + 18);
      doc.text(m.score2.toString(), 14 + boxWidth - 5, y + 18, { align: 'right' });
      
      doc.setDrawColor(148, 163, 184);
      doc.line(14 + boxWidth, y + boxHeight / 2, 14 + boxWidth + horizontalGap / 2, y + boxHeight / 2);
      if (i === 0) {
        doc.line(14 + boxWidth + horizontalGap / 2, y + boxHeight / 2, 14 + boxWidth + horizontalGap / 2, y + verticalGap / 2 + boxHeight / 2);
      } else {
        doc.line(14 + boxWidth + horizontalGap / 2, y + boxHeight / 2, 14 + boxWidth + horizontalGap / 2, y - verticalGap / 2 + boxHeight / 2);
      }
    });

    if (finals) {
      const t1 = tournament.playoffTeams?.find(t => t.id === finals.team1Id)?.name || 'TBD';
      const t2 = tournament.playoffTeams?.find(t => t.id === finals.team2Id)?.name || 'TBD';
      const y = currentY + verticalGap / 2;
      const x = 14 + boxWidth + horizontalGap;

      doc.line(14 + boxWidth + horizontalGap / 2, y + boxHeight / 2, x, y + boxHeight / 2);

      doc.setDrawColor(15, 23, 42);
      doc.setFillColor(248, 250, 252);
      doc.rect(x, y, boxWidth + 10, boxHeight + 8, 'FD');
      
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text('GRAND FINALS', x + 2, y + 6);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', finals.score1 > finals.score2 ? 'bold' : 'normal');
      doc.text(t1, x + 2, y + 15);
      doc.text(finals.score1.toString(), x + boxWidth + 8, y + 15, { align: 'right' });
      
      doc.setFont('helvetica', finals.score2 > finals.score1 ? 'bold' : 'normal');
      doc.text(t2, x + 2, y + 22);
      doc.text(finals.score2.toString(), x + boxWidth + 8, y + 22, { align: 'right' });
      
      if (finals.status === 'LOCKED') {
        const winner = finals.score1 > finals.score2 ? t1 : t2;
        doc.setFontSize(12);
        doc.setTextColor(34, 197, 94);
        doc.text(`CHAMPION: ${winner.toUpperCase()}`, x + boxWidth + 20, y + boxHeight / 2 + 4);
      }
    }
  }

  // 5. Match History (New Page)
  doc.addPage();
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('MATCH HISTORY', 14, 20);

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
    startY: 35,
    head: [['Round', 'Court', 'Team 1', 'Score', 'Team 2', 'Status']],
    body: matchData,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], fontSize: 9, halign: 'center' },
    bodyStyles: { fontSize: 8, halign: 'center' },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });

  // Footer
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`CourtOS Official Report // Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
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
      doc.setFillColor(15, 23, 42);
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
        doc.setDrawColor(203, 213, 225);
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
