import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSideClient } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import AdminClient from './AdminClient'

export default async function AdminPage() {
  const cookieStore = await cookies()
  const supabase = createServerSideClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const workspaceId = getWorkspaceId(cookieStore)
  if (!workspaceId) redirect('/workspace')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Workspace members with profiles
  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('id, role, joined_at, user:profiles(id, full_name, avatar_url, email, created_at)')
    .eq('workspace_id', workspaceId)
    .order('joined_at', { ascending: false })

  const users = (memberships ?? []).map((m) => ({
    ...m.user,
    workspace_member_id: m.id,
    workspace_role: m.role,
    joined_at: m.joined_at,
  })).filter((u) => u.id)

  // Projects in this workspace
  const { data: projects } = await supabase
    .from('projects')
    .select(
      `*,
       project_managers(user:profiles!project_managers_user_id_fkey(id, full_name, avatar_url)),
       members:project_members(user:profiles(id, full_name, avatar_url, role))`
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  // Workspace invitations
  const { data: invitations } = await supabase
    .from('workspace_invitations')
    .select('*, inviter:profiles!workspace_invitations_invited_by_fkey(full_name)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  return (
    <AdminClient
      currentProfile={profile}
      initialUsers={users ?? []}
      initialProjects={projects ?? []}
      initialInvitations={invitations ?? []}
      workspaceId={workspaceId}
    />
  )
}
