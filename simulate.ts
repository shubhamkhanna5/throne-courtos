
import { v4 as uuidv4 } from 'uuid';

type TournamentMode = 'MINI' | 'CORE' | 'MAJOR';

interface Player {
  id: string;
  name: string;
  rank: number;
  points: number;
  pointDiff: number;
  skill: number; // Hidden skill level for simulation
}

interface Match {
  p1: Player;
  p2: Player;
  p3: Player;
  p4: Player;
  score1: number;
  score2: number;
}

function simulateMatch(p1: Player, p2: Player, p3: Player, p4: Player) {
  const team1Skill = p1.skill + p2.skill;
  const team2Skill = p3.skill + p4.skill;
  
  // Base score is 11 or 15. Let's use 11.
  // Probability of winning a point is proportional to skill.
  let s1 = 0;
  let s2 = 0;
  const target = 11;
  
  while (s1 < target && s2 < target) {
    if (Math.random() * (team1Skill + team2Skill) < team1Skill) {
      s1++;
    } else {
      s2++;
    }
  }
  
  // Ensure no ties (already handled by while loop logic, but just in case)
  if (s1 === s2) s1++; 

  return { s1, s2 };
}

function runSimulation(mode: TournamentMode, rounds: number) {
  const playerCount = mode === 'MAJOR' ? 32 : mode === 'CORE' ? 24 : 16;
  
  // Initialize players with random skills (0 to 100)
  let players: Player[] = Array.from({ length: playerCount }).map((_, i) => ({
    id: uuidv4(),
    name: `P${i + 1}`,
    rank: i + 1,
    points: 0,
    pointDiff: 0,
    skill: Math.random() * 100
  }));

  console.log(`\n--- Starting Simulation: ${mode} (${playerCount} players, ${rounds} rounds) ---`);

  for (let r = 1; r <= rounds; r++) {
    // Sort players by rank for pod assignment
    players.sort((a, b) => a.rank - b.rank);
    
    // Assign to pods (4 players per pod)
    const pods: Player[][] = [];
    for (let i = 0; i < playerCount; i += 4) {
      pods.push(players.slice(i, i + 4));
    }

    // Simulate matches in each pod
    pods.forEach((pod, podIdx) => {
      const [p1, p2, p3, p4] = pod;
      
      // 3 matches per pod (Americano style)
      const matches = [
        { teams: [p1, p2, p3, p4] },
        { teams: [p1, p3, p2, p4] },
        { teams: [p1, p4, p2, p3] }
      ];

      matches.forEach(m => {
        const { s1, s2 } = simulateMatch(m.teams[0], m.teams[1], m.teams[2], m.teams[3]);
        
        // Update points
        const updatePoints = (player: Player, scored: number, conceded: number, win: boolean) => {
          player.points += win ? 2 : 0;
          player.pointDiff += (scored - conceded);
        };

        updatePoints(m.teams[0], s1, s2, s1 > s2);
        updatePoints(m.teams[1], s1, s2, s1 > s2);
        updatePoints(m.teams[2], s2, s1, s2 > s1);
        updatePoints(m.teams[3], s2, s1, s2 > s1);
      });
    });

    // Re-rank players
    players.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
      return 0;
    });

    players.forEach((p, i) => p.rank = i + 1);
  }

  // Check correlation between skill and final rank
  players.sort((a, b) => b.skill - a.skill);
  const topSkillPlayers = players.slice(0, 4);
  const topRankPlayers = [...players].sort((a, b) => a.rank - b.rank).slice(0, 4);
  
  const overlap = topSkillPlayers.filter(p => topRankPlayers.some(tr => tr.id === p.id)).length;
  
  console.log(`Top 4 Skill Players: ${topSkillPlayers.map(p => `${p.name}(S:${p.skill.toFixed(1)}, R:${p.rank})`).join(', ')}`);
  console.log(`Top 4 Ranked Players: ${topRankPlayers.map(p => `${p.name}(R:${p.rank}, S:${p.skill.toFixed(1)})`).join(', ')}`);
  console.log(`Fairness Score (Top 4 Overlap): ${overlap}/4`);
}

runSimulation('MINI', 4);
runSimulation('CORE', 4);
runSimulation('MAJOR', 4);
