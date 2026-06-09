import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
// Import UI Input component for advisor code editing
import { Input } from '@/components/ui/input';
import { Users as UsersIcon, UserPlus, Shield, UserCircle, ExternalLink, Settings, Briefcase, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import UserPagePermissions from '../components/users/UserPagePermissions';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState(null);
  const [assigningBranchesUser, setAssigningBranchesUser] = useState(null);
  const [selectedBranches, setSelectedBranches] = useState([]);
  // Local states to track unsaved role selection and advisor code edits per user
  const [roleEdits, setRoleEdits] = useState({});
  const [advisorEdits, setAdvisorEdits] = useState({});

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list('-created_date'),
  });

  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => base44.entities.Branch.filter({ is_active: true }),
  });

  const { data: pages = [] } = useQuery({
    queryKey: ['pages'],
    queryFn: () => base44.entities.Page.filter({ is_active: true }),
  });

  const { data: userPageAccess = [] } = useQuery({
    queryKey: ['user-page-access'],
    queryFn: () => base44.entities.UserPageAccess.list(),
  });

  const currentRole = currentUser?.user_role || currentUser?.role;
  const isAdmin = currentRole === 'ADMIN' || currentRole === 'admin';
  const isAdminManager = currentRole === 'ADMIN_MANAGER';

  // Mutation to update user roles and advisor codes using the backend Deno function
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole, assignedBranches, advisorCode }) => {
      const payload = { userId, role: newRole };
      if (assignedBranches !== undefined) {
        payload.assigned_branches = assignedBranches;
      }
      // Add advisor_code field to the payload if provided
      if (advisorCode !== undefined) {
        payload.advisor_code = advisorCode;
      }
      const response = await base44.functions.invoke('updateUserRole', payload);
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User role updated successfully');
      setAssigningBranchesUser(null);
      // Reset the temporary role and advisor code edit states upon a successful save
      setRoleEdits({});
      setAdvisorEdits({});
    },
    onError: (error) => {
      console.error('Role update error:', error);
      toast.error('Failed to update role: ' + (error.message || 'Unknown error'));
    },
  });

  // Only admins and admin managers can access this page
  if (!isLoading && currentUser && !isAdmin && !isAdminManager) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">You don't have permission to access this page.</p>
      </div>
    );
  }

  const handleRoleChange = (userId, newRole) => {
    // If selecting MARKETING (merged with CRE Manager), open branch assignment
    if (newRole === 'MARKETING') {
      const user = users.find(u => u.id === userId);
      setAssigningBranchesUser(user);
      setSelectedBranches(user.assigned_branches || []);
      return;
    }

    // If selecting SERVICE_ADVISOR, initialize temporary edit states to prompt for Advisor Code
    if (newRole === 'SERVICE_ADVISOR') {
      const user = users.find(u => u.id === userId);
      setRoleEdits(prev => ({ ...prev, [userId]: newRole }));
      setAdvisorEdits(prev => ({ ...prev, [userId]: user.advisor_code || '' }));
      return;
    }

    // If changing role to any other type, clear temporary edit states and trigger save immediately.
    // Set advisorCode to null to clear advisor code on the user record.
    setRoleEdits(prev => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    setAdvisorEdits(prev => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });

    updateRoleMutation.mutate({ userId, newRole, advisorCode: null });
  };

  // Saves the SERVICE_ADVISOR role change along with their custom Advisor Code
  const handleSaveServiceAdvisor = (userId) => {
    const finalRole = roleEdits[userId] !== undefined ? roleEdits[userId] : 'SERVICE_ADVISOR';
    const finalAdvisorCode = advisorEdits[userId] !== undefined 
      ? advisorEdits[userId] 
      : (users.find(u => u.id === userId)?.advisor_code || '');

    updateRoleMutation.mutate({ 
      userId, 
      newRole: finalRole, 
      advisorCode: finalAdvisorCode 
    });
  };

  const handleSaveBranches = () => {
    if (!assigningBranchesUser) return;
    updateRoleMutation.mutate({
      userId: assigningBranchesUser.id,
      newRole: 'MARKETING',
      assignedBranches: selectedBranches
    });
  };

  const getRoleBadgeColor = (role) => {
    if (role === 'ADMIN' || role === 'admin') return 'bg-purple-100 text-purple-700 border-purple-200';
    if (role === 'ADMIN_MANAGER') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (role === 'MARKETING') return 'bg-green-100 text-green-700 border-green-200';
    if (role === 'BRANCH_MANAGER') return 'bg-teal-100 text-teal-700 border-teal-200';
    if (role === 'REPORTING_ANALYST') return 'bg-pink-100 text-pink-700 border-pink-200';
    if (role === 'SERVICE_ADVISOR') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-blue-100 text-blue-700 border-blue-200'; // Default for CRE
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {/* Change 1: Added tracking-tight and changed description color and size */}
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">User Management</h1>
          <p className="text-slate-500 mt-1 text-sm">Manage user accounts and roles</p>
        </div>
      </div>

      {/* Info Card - Change 2: Updated border, shadow, and background styles */}
      <Card className="border border-slate-200 shadow-sm" style={{ background: '#F8F9FB' }}>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            {/* Change 3: Replaced text-blue-600 class with gold inline style */}
            <UserPlus className="w-5 h-5 mt-0.5" style={{ color: '#C9A84C' }} />
            <div className="flex-1">
              {/* Change 4: Updated header and paragraph text colors */}
              <h3 className="font-semibold text-slate-800 mb-1">Invite New Users</h3>
              <p className="text-sm text-slate-600">
                To add new users to the system, use the Base44 platform's user invitation feature. 
                New users will receive an email invitation to create their account.
              </p>
              {/* Change 4: Replaced text-blue-600 classes on the link with inline style */}
              <a 
                href="https://app.base44.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-3 text-sm font-medium" style={{ color: '#C9A84C' }}
              >
                Go to Base44 Dashboard
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        {/* Change 5: Dark card header style and white border */}
        <CardHeader className="border-b border-white/10" style={{ background: '#0D1117' }}>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {/* Change 6: Changed icon color and title text to white */}
              <UsersIcon className="w-5 h-5 text-white" />
              <span className="text-white">All Users ({users.length})</span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-12 text-slate-500">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <UsersIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  {/* Change 7 & 8: Dark header row and text-slate-400 table head cells */}
                  <TableRow className="border-white/10 hover:bg-transparent" style={{ background: '#0D1117' }}>
                    <TableHead className="text-slate-400">Name</TableHead>
                    <TableHead className="text-slate-400">Email</TableHead>
                    <TableHead className="text-slate-400">Role</TableHead>
                    <TableHead className="text-slate-400">Joined</TableHead>
                    <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} className="hover:bg-slate-50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserCircle className="w-5 h-5 text-slate-400" />
                          <span className="font-medium">{user.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600">{user.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Shield className={`w-4 h-4 ${(user.user_role || user.role) === 'ADMIN' ? 'text-purple-600' : 'text-blue-600'}`} />
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getRoleBadgeColor(user.user_role || user.role)}`}>
                            {(user.user_role || user.role) === 'ADMIN_MANAGER' ? 'Admin Manager' : 
                             (user.user_role || user.role) === 'SERVICE_ADVISOR' ? 'Service Advisor' :
                             (user.user_role || user.role) === 'BRANCH_MANAGER' ? 'Branch Manager' :
                             (user.user_role || user.role) === 'REPORTING_ANALYST' ? 'Reporting Analyst' :
                             (user.user_role || user.role)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {format(new Date(user.created_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <div className="flex flex-col gap-2 items-start">
                            <div className="flex items-center gap-2">
                              <Select
                                value={roleEdits[user.id] !== undefined ? roleEdits[user.id] : (user.user_role || user.role || 'CRE')}
                                onValueChange={(newRole) => handleRoleChange(user.id, newRole)}
                              >
                                <SelectTrigger className="w-40">
                                  <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ADMIN">Admin</SelectItem>
                                  <SelectItem value="ADMIN_MANAGER">Admin Manager</SelectItem>
                                  <SelectItem value="CRE">CRE</SelectItem>
                                  <SelectItem value="MARKETING">Marketing</SelectItem>
                                  <SelectItem value="BRANCH_MANAGER">Branch Manager</SelectItem>
                                  <SelectItem value="REPORTING_ANALYST">Reporting Analyst</SelectItem>
                                  <SelectItem value="SERVICE_ADVISOR">Service Advisor</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingUser(user)}
                                title="Page Permissions"
                              >
                                <Settings className="w-4 h-4" />
                              </Button>
                              <span className="text-xs text-slate-500">
                                ({userPageAccess.filter(upa => upa.user_id === user.id).length} pages)
                              </span>
                            </div>

                            {/* Render Advisor Code input field when the active role is SERVICE_ADVISOR */}
                            {((roleEdits[user.id] !== undefined ? roleEdits[user.id] : (user.user_role || user.role)) === 'SERVICE_ADVISOR') && (
                              <div className="flex flex-col gap-1 w-40 mt-1">
                                <Label htmlFor={`advisor-code-${user.id}`} className="text-xs text-slate-500 font-medium">
                                  Advisor Code
                                </Label>
                                <div className="flex gap-1.5">
                                  <Input
                                    id={`advisor-code-${user.id}`}
                                    value={advisorEdits[user.id] !== undefined ? advisorEdits[user.id] : (user.advisor_code || '')}
                                    onChange={(e) => setAdvisorEdits(prev => ({ ...prev, [user.id]: e.target.value }))}
                                    placeholder="Code"
                                    className="h-8 text-xs w-24"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => handleSaveServiceAdvisor(user.id)}
                                    className="h-8 px-2 text-xs"
                                  >
                                    Save
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 text-sm">—</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role Information - Change 10: Added bottom border to all card headers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2 border-b border-slate-100">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600" />
              Admin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>• Full system access</li>
              <li>• Manage all settings</li>
              <li>• Manage user roles</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 border-b border-slate-100">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-600" />
              Admin Manager
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>• Full system access</li>
              <li>• Manage all settings</li>
              <li>• Manage users</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 border-b border-slate-100">
            <CardTitle className="text-lg flex items-center gap-2">
              <UserCircle className="w-5 h-5 text-blue-600" />
              CRE
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>• Create & Manage Coupons</li>
              <li>• Verify Coupons</li>
              <li>• View Dashboards</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 border-b border-slate-100">
            <CardTitle className="text-lg flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-green-600" />
              Marketing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>• View Reports & Stats</li>
              <li>• Manage Offers</li>
              <li>• Branch Management</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 border-b border-slate-100">
            <CardTitle className="text-lg flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-teal-600" />
              Branch Manager
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>• Create & Manage Coupons</li>
              <li>• View Branch Reports</li>
              <li>• Verify Coupons</li>
              <li>• Team Management</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 border-b border-slate-100">
            <CardTitle className="text-lg flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-pink-600" />
              Reporting Analyst
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>• View All Reports</li>
              <li>• Analytics Dashboard</li>
              <li>• Export Data</li>
              <li>• Read-Only Access</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 border-b border-slate-100">
            <CardTitle className="text-lg flex items-center gap-2">
              <Eye className="w-5 h-5 text-amber-600" />
              Service Advisor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>• Verify Coupons Only</li>
              <li>• View Coupon Details</li>
              <li>• Check Validity</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Branch Assignment Modal */}
      <Dialog open={!!assigningBranchesUser} onOpenChange={() => setAssigningBranchesUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Branches for {assigningBranchesUser?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Label>Select Branches:</Label>
            <div className="grid grid-cols-1 gap-2 border rounded-lg p-4 bg-slate-50 max-h-60 overflow-y-auto">
              {branches.length === 0 ? (
                <p className="text-sm text-slate-500">No active branches found.</p>
              ) : (
                branches.map((branch) => (
                  <div key={branch.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`branch-${branch.id}`}
                      checked={selectedBranches.includes(branch.name)}
                      onCheckedChange={(checked) => {
                        setSelectedBranches(prev => 
                          checked 
                            ? [...prev, branch.name]
                            : prev.filter(b => b !== branch.name)
                        );
                      }}
                    />
                    <Label htmlFor={`branch-${branch.id}`} className="cursor-pointer">
                      {branch.name}
                    </Label>
                  </div>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigningBranchesUser(null)}>
              Cancel
            </Button>
            {/* Change 9: Styled button with gold linear gradient */}
            <Button onClick={handleSaveBranches} className="text-white font-medium" style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}>
              Save & Assign Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Page Permissions Editor - Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <UserPagePermissions
              user={editingUser}
              onClose={() => setEditingUser(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}