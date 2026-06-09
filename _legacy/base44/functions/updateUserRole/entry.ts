import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const currentUser = await base44.auth.me();

        if (!currentUser) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Only admins can update user roles
        if (currentUser.role !== 'ADMIN' && currentUser.role !== 'admin') {
            return Response.json({ error: 'Only admins can update user roles' }, { status: 403 });
        }

        // Destructure advisor_code from the request payload to allow Service Advisors code updates
        const { userId, role, assigned_branches, advisor_code } = await req.json();

        if (!userId) {
            return Response.json({ error: 'userId is required' }, { status: 400 });
        }

        const updateData = {};
        if (role !== undefined) updateData.user_role = role;
        if (assigned_branches !== undefined) updateData.assigned_branches = assigned_branches;
        // Save the advisor code if it is passed in the update payload
        if (advisor_code !== undefined) updateData.advisor_code = advisor_code;

        // Use service role to bypass User entity security restrictions
        const updatedUser = await base44.asServiceRole.entities.User.update(userId, updateData);

        return Response.json({ success: true, user: updatedUser });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});