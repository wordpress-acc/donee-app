import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSideClient } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { isSuperAdmin, isPM } from '@/lib/permissions'
import StatCards from '@/components/dashboard/StatCards'
import TaskChart from '@/components/dashboard/TaskChart'
import ProjectGrid from '@/components/dashboard/ProjectGrid'

export const metadata = { title: 'Dashboard — Donee' }

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const supabase = createServerSideClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const workspaceId = getWorkspaceId(cookieStore)
  if (!workspaceId) redirect('/workspace')

  const [{ data: profile }, { data: workspaceMember }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).single(),
  ])

  const isDeveloper = !isSuperAdmin(profile, workspaceMember) && !isPM(profile, workspaceMember)
  const isProjectManager = isPM(profile, workspaceMember) && !isSuperAdmin(profile, workspaceMember)

  // For PMs, scope to projects they manage
  let pmProjectIds = null
  if (isProjectManager) {
    const { data: managerships } = await supabase
      .from('project_managers')
      .select('project_id')
      .eq('user_id', user.id)
    pmProjectIds = (managerships ?? []).map((m) => m.project_id)
  }

  // For developers, scope to projects they're a member of or have assigned tasks
  let devProjectIds = null
  if (isDeveloper) {
    const [{ data: memberRows }, { data: assignedRows }] = await Promise.all([
      supabase.from('project_members').select('project_id').eq('user_id', user.id),
      supabase.from('tasks').select('project_id').eq('workspace_id', workspaceId).eq('assigned_to', user.id),
    ])
    devProjectIds = [...new Set([
      ...(memberRows ?? []).map((r) => r.project_id),
      ...(assignedRows ?? []).map((r) => r.project_id),
    ])]
  }

  const noProjects = (isDeveloper && devProjectIds.length === 0) || (isProjectManager && pmProjectIds.length === 0)
  const nullId = '00000000-0000-0000-0000-000000000000'
  const scopedProjectIds = isDeveloper ? devProjectIds : isProjectManager ? pmProjectIds : null

  // ── Stats ───────────────────────────────────────────────
  let projectCountQuery = supabase.from('projects').select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId).eq('is_archived', false)
  let taskCountQuery = supabase.from('tasks').select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
  let completedCountQuery = supabase.from('tasks').select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId).eq('status', 'done')

  if (scopedProjectIds !== null) {
    if (noProjects) {
      projectCountQuery = projectCountQuery.eq('id', nullId)
      taskCountQuery = taskCountQuery.eq('id', nullId)
      completedCountQuery = completedCountQuery.eq('id', nullId)
    } else {
      projectCountQuery = projectCountQuery.in('id', scopedProjectIds)
      taskCountQuery = taskCountQuery.in('project_id', scopedProjectIds)
      completedCountQuery = completedCountQuery.in('project_id', scopedProjectIds)
    }
  }

  const [
    { count: totalProjects },
    { count: totalTasks },
    { count: myTasks },
    { count: completedTasks },
  ] = await Promise.all([
    projectCountQuery,
    taskCountQuery,
    supabase.from('tasks').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('assigned_to', user.id),
    completedCountQuery,
  ])

  // ── Chart data: tasks created/completed per day (last 14 days) ───────────
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: createdTasks } = await supabase
    .from('tasks')
    .select('created_at')
    .eq('workspace_id', workspaceId)
    .gte('created_at', since)

  const { data: doneTasks } = await supabase
    .from('tasks')
    .select('updated_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'done')
    .gte('updated_at', since)

  function buildDayMap(items, dateKey) {
    const map = {}
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      map[key] = 0
    }
    ;(items ?? []).forEach((item) => {
      const key = new Date(item[dateKey]).toISOString().slice(0, 10)
      if (map[key] !== undefined) map[key]++
    })
    return Object.entries(map).map(([date, count]) => ({ date, count }))
  }

  const chartData = buildDayMap(createdTasks, 'created_at').map((row, i) => ({
    date: row.date,
    created: row.count,
    completed: buildDayMap(doneTasks, 'updated_at')[i]?.count ?? 0,
  }))

  // ── Projects with task counts ─────────────────────────────────────────────
  let projectGridQuery = supabase
    .from('projects')
    .select(
      `id, name, description, color,
       project_managers(user:profiles!project_managers_user_id_fkey(id, full_name, avatar_url)),
       tasks(status)`
    )
    .eq('workspace_id', workspaceId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(12)

  if (scopedProjectIds !== null) {
    projectGridQuery = noProjects
      ? projectGridQuery.eq('id', nullId)
      : projectGridQuery.in('id', scopedProjectIds)
  }

  const { data: projects } = await projectGridQuery

  const projectsWithCounts = (projects ?? []).map((p) => {
    const byStatus = {}
    ;(p.tasks ?? []).forEach((t) => {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1
    })
    return { ...p, tasks: undefined, taskCounts: byStatus, totalTasks: p.tasks?.length ?? 0 }
  })

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Welcome back. Here&apos;s what&apos;s happening.</p>
      </div>

      <StatCards
        totalProjects={totalProjects ?? 0}
        totalTasks={totalTasks ?? 0}
        myTasks={myTasks ?? 0}
        completedTasks={completedTasks ?? 0}
      />

      <TaskChart data={chartData} />

      <ProjectGrid projects={projectsWithCounts} />
    </div>
  )
}
