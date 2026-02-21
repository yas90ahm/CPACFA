export type TeamRole = 'CONTROLLER' | 'REVIEWER' | 'CERTIFIER' | 'ADMIN';
export type TeamMemberStatus = 'active' | 'invited' | 'deactivated';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: TeamMemberStatus;
  lastActive: string | null;
}

export const mockTeam: TeamMember[] = [
  { id: 'u1', name: 'Sarah Chen', email: 'sarah.chen@apexmfg.com', role: 'CONTROLLER', status: 'active', lastActive: '2 hours ago' },
  { id: 'u2', name: 'Mike Torres', email: 'mike.torres@apexmfg.com', role: 'CERTIFIER', status: 'active', lastActive: '1 day ago' },
  { id: 'u3', name: 'Lisa Park', email: 'lisa.park@apexmfg.com', role: 'REVIEWER', status: 'active', lastActive: '3 days ago' },
  { id: 'u4', name: 'David Kim', email: 'david.kim@apexmfg.com', role: 'ADMIN', status: 'active', lastActive: '1 week ago' },
  { id: 'u5', name: 'Rachel Adams', email: 'rachel.adams@apexmfg.com', role: 'CONTROLLER', status: 'invited', lastActive: null },
];

export function getTeamByEntity(_entityId: string): TeamMember[] {
  return mockTeam;
}
