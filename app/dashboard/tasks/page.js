import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSideClient } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { isSuperAdmin, isPM } from '@/lib/permissions'
import TasksPageClient from './TasksPageClient'

export default async function TasksPage({ searchParams }) {
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

  const { data: workspaceMember } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  const isAdmin = isSuperAdmin(profile, workspaceMember)
  const isProjectManager = isPM(profile, workspaceMember)

  // Build task query scoped by role
  let taskQuery = supabase
    .from('tasks')
    .select(
      `*,
       project:projects(id, name, color),
       assignee:profiles!tasks_assigned_to_fkey(id, full_name, avatar_url),
       creator:profiles!tasks_created_by_fkey(id, full_name)`
    )
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })

  if (isAdmin) {
    // sees all tasks in workspace — no extra filter
  } else if (isProjectManager) {
    // PM sees tasks from projects they manage
    const { data: managerships } = await supabase
      .from('project_managers')
      .select('project_id')
      .eq('user_id', user.id)
    const pmProjectIds = (managerships ?? []).map((m) => m.project_id)
    if (pmProjectIds.length === 0) {
      taskQuery = taskQuery.eq('id', '00000000-0000-0000-0000-000000000000')
    } else {
      taskQuery = taskQuery.in('project_id', pmProjectIds)
    }
  } else {
    // Developer sees only tasks assigned to them
    taskQuery = taskQuery.eq('assigned_to', user.id)
  }

  const { data: tasks } = await taskQuery

  // Projects for filter dropdown — scoped by role
  let projectQuery = supabase
    .from('projects')
    .select('id, name, color')
    .eq('workspace_id', workspaceId)
    .eq('is_archived', false)
    .order('name')

  if (isProjectManager && !isAdmin) {
    const { data: managerships } = await supabase
      .from('project_managers')
      .select('project_id')
      .eq('user_id', user.id)
    const pmProjectIds = (managerships ?? []).map((m) => m.project_id)
    projectQuery = pmProjectIds.length > 0
      ? projectQuery.in('id', pmProjectIds)
      : projectQuery.eq('id', '00000000-0000-0000-0000-000000000000')
  } else if (!isAdmin && !isProjectManager) {
    // Developer: only projects they're a member of or have assigned tasks
    const [{ data: memberRows }, { data: assignedRows }] = await Promise.all([
      supabase.from('project_members').select('project_id').eq('user_id', user.id),
      supabase.from('tasks').select('project_id').eq('workspace_id', workspaceId).eq('assigned_to', user.id),
    ])
    const devProjectIds = [...new Set([
      ...(memberRows ?? []).map((r) => r.project_id),
      ...(assignedRows ?? []).map((r) => r.project_id),
    ])]
    projectQuery = devProjectIds.length > 0
      ? projectQuery.in('id', devProjectIds)
      : projectQuery.eq('id', '00000000-0000-0000-0000-000000000000')
  }

  const { data: projects } = await projectQuery

  // Workspace members for assignee filter
  const { data: members } = await supabase
    .from('workspace_members')
    .select('user:profiles(id, full_name, avatar_url)')
    .eq('workspace_id', workspaceId)

  const users = (members ?? []).map((m) => m.user).filter(Boolean)

  // Tell client how to re-fetch with same role scope
  const taskFilter = isAdmin
    ? null
    : isProjectManager
      ? { type: 'pm_projects', projectIds: (tasks ?? []).map((t) => t.project_id).filter((v, i, a) => a.indexOf(v) === i) }
      : { type: 'assigned', userId: user.id }

  const pageTitle = !isProjectManager && !isAdmin ? 'My Tasks' : 'All Tasks'

  return (
    <TasksPageClient
      initialTasks={tasks ?? []}
      projects={projects ?? []}
      users={users}
      profile={profile}
      workspaceMember={workspaceMember}
      workspaceId={workspaceId}
      openTaskId={(await searchParams)?.task ?? null}
      taskFilter={taskFilter}
      pageTitle={pageTitle}
    />
  )
}
