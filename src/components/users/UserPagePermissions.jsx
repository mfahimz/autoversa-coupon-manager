import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Save, X, Settings } from 'lucide-react';
import { toast } from 'sonner';

export default function UserPagePermissions({ user, onClose }) {
  const [selectedPages, setSelectedPages] = useState([]);
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: pages = [] } = useQuery({
    queryKey: ['pages'],
    queryFn: () => base44.entities.Page.filter({ is_active: true }),
  });

  const { data: userPageAccess = [] } = useQuery({
    queryKey: ['user-page-access'],
    queryFn: () => base44.entities.UserPageAccess.filter({ user_id: user.id }),
  });

  useEffect(() => {
    if (pages.length === 0) return;
    
    if (userPageAccess.length > 0) {
      // Load from database
      setSelectedPages(userPageAccess.map(upa => upa.page_id));
    } else {
      // Initialize with default based on role
      const role = user.user_role || user.role || 'CRE';
      const defaultPages = pages.filter(p => p.default_roles && Array.isArray(p.default_roles) && p.default_roles.includes(role));
      setSelectedPages(defaultPages.map(p => p.page_id));
    }
  }, [userPageAccess, pages, user]);

  const updateMutation = useMutation({
    mutationFn: async (selectedPageIds) => {
      if (selectedPageIds.length === 0) {
        throw new Error('At least one page must be selected');
      }

      // Delete existing access
      const existingAccess = await base44.entities.UserPageAccess.filter({ user_id: user.id });
      for (const access of existingAccess) {
        await base44.entities.UserPageAccess.delete(access.id);
      }
      
      // Create new access records
      for (const pageId of selectedPageIds) {
        await base44.entities.UserPageAccess.create({
          user_id: user.id,
          page_id: pageId
        });
      }


      
      return { success: true, count: selectedPageIds.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user-page-access'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`Updated access to ${data.count} pages`);
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to update permissions: ' + error.message);
    },
  });

  const handleTogglePage = (pageId) => {
    setSelectedPages(prev => 
      prev.includes(pageId) 
        ? prev.filter(p => p !== pageId)
        : [...prev, pageId]
    );
  };

  const handleSelectAll = () => {
    setSelectedPages(pages.map(p => p.page_id));
  };

  const handleSelectNone = () => {
    setSelectedPages([]);
  };

  const handleSave = () => {
    updateMutation.mutate(selectedPages);
  };

  return (
    <Card className="border-2 border-blue-200 shadow-lg">
      <CardHeader className="bg-blue-50 border-b border-blue-200">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            Page Permissions for {user.full_name}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={handleSelectNone}>
              Select None
            </Button>
          </div>

          <div className="space-y-4">
            {['Dashboards', 'Coupons', 'Settings'].map((group) => {
              const groupPages = pages.filter(p => p.page_group === group);
              return (
                <div key={group}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{group}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {groupPages.map((page) => (
                      <div
                        key={page.page_id}
                        className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedPages.includes(page.page_id)
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                        onClick={() => handleTogglePage(page.page_id)}
                      >
                        <Checkbox
                          checked={selectedPages.includes(page.page_id)}
                          onCheckedChange={() => handleTogglePage(page.page_id)}
                        />
                        <Label className="cursor-pointer text-sm">{page.page_name}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending ? 'Saving...' : 'Save Permissions'}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}