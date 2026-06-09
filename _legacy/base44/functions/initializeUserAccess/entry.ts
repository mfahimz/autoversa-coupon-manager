import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user already has page access
    const existingAccess = await base44.entities.UserPageAccess.filter({ user_id: user.id });
    
    if (existingAccess.length > 0) {
      return Response.json({ message: 'User already has page access configured', pageCount: existingAccess.length });
    }

    // Get all pages
    const allPages = await base44.entities.Page.filter({ is_active: true });
    
    // Determine default pages based on role
    const role = user.user_role || user.role || 'CRE';
    const defaultPages = allPages.filter(p => p.default_roles && p.default_roles.includes(role));

    // Create access records
    const accessRecords = [];
    for (const page of defaultPages) {
      const record = await base44.asServiceRole.entities.UserPageAccess.create({
        user_id: user.id,
        page_id: page.page_id
      });
      accessRecords.push(record);
    }

    return Response.json({ 
      success: true, 
      message: `Initialized ${accessRecords.length} page access records for ${role}`,
      pages: accessRecords.map(r => r.page_id)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});