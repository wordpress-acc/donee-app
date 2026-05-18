'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase'
import TaskTable from '@/components/tasks/TaskTable'
import TaskFilters from '@/components/tasks/TaskFilters'
import AddTaskModal from '@/components/tasks/AddTaskModal'
import TaskDrawer from '@/components/tasks/TaskDrawer'
import Avatar from '@/components/ui/Avatar'
import { Plus, Archive } from 'lucide-react'

async function fetchProjectTasks(projectId) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select(
      `*,
       project:projects(id, name, color),
       assignee:profiles!tasks_assigned_to_fkey(id, full_name, avatar_url),
       creator:profiles!tasks_created_by_fkey(id, full_name)`
    )
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export default function ProjectPageClient({ project, initialTasks, users, profile, workspaceMember }) {
  const [filters, setFilters] = useState({
    search: '',
    projectIds: [],
    statuses: [],
    priorities: [],
    assigneeIds: [],
    dateFrom: '',
    dateTo: '',
  })
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [addModalOpen, setAddModalOpen] = useState(false)

  const { data: tasks } = useQuery({
    queryKey: ['tasks', 'project', project.id],
    queryFn: () => fetchProjectTasks(project.id),
    initialData: initialTasks,
    staleTime: 30_000,
  })

  const filtered = tasks.filter((t) => {
    if (filters.search && !t.title.toLowerCase().includes(filters.search.toLowerCase())) return false
    if (filters.statuses.length && !filters.statuses.includes(t.status)) return false
    if (filters.priorities.length && !filters.priorities.includes(t.priority)) return false
    if (filters.assigneeIds.length && !filters.assigneeIds.includes(t.assigned_to)) return false
    if (filters.dateFrom && new Date(t.created_at) < new Date(filters.dateFrom)) return false
    if (filters.dateTo && new Date(t.created_at) > new Date(filters.dateTo + 'T23:59:59')) return false
    return true
  })

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null
  const members = project.members?.map((m) => m.user).filter(Boolean) ?? []

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Project header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex-shrink-0"
              style={{ backgroundColor: project.color ?? '#6366f1' }}
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
                {project.is_archived && (
                  <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    <Archive className="h-3 w-3" /> Archived
                  </span>
                )}
              </div>
              {project.description && (
                <p className="text-slate-500 text-sm mt-1">{project.description}</p>
              )}
              <div className="flex items-center gap-4 mt-3">
                {project.project_managers?.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">PM:</span>
                    <div className="flex items-center gap-1.5">
                      <div className="flex -space-x-1">
                        {project.project_managers.slice(0, 3).map((mgr) => (
                          <Avatar key={mgr.user.id} user={mgr.user} size="xs" className="ring-1 ring-white" />
                        ))}
                      </div>
                      <span className="text-xs font-medium text-slate-700">
                        {project.project_managers.slice(0, 2).map((m) => m.user.full_name).join(', ')}
                        {project.project_managers.length > 2 && ` +${project.project_managers.length - 2}`}
                      </span>
                    </div>
                  </div>
                )}
                {members.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Members:</span>
                    <div className="flex -space-x-2">
                      {members.slice(0, 5).map((m) => (
                        <Avatar key={m.id} user={m} size="xs" className="ring-2 ring-white" />
                      ))}
                      {members.length > 5 && (
                        <div className="w-6 h-6 rounded-full bg-slate-200 ring-2 ring-white flex items-center justify-center text-xs text-slate-600 font-medium">
                          +{members.length - 5}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
            Add Task
          </button>
        </div>
      </div>

      <TaskFilters
        filters={filters}
        onChange={setFilters}
        projects={[]}
        users={users}
        hideProjectFilter
      />

      <TaskTable
        tasks={filtered}
        profile={profile}
        workspaceMember={workspaceMember}
        onRowClick={(task) => setSelectedTaskId(task.id)}
        selectedTaskId={selectedTaskId}
      />

      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          profile={profile}
          workspaceMember={workspaceMember}
          projects={[project]}
          users={users}
          isOpen={!!selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      <AddTaskModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        projects={[project]}
        users={users}
        profile={profile}
        workspaceMember={workspaceMember}
        workspaceId={project.workspace_id}
        defaultProjectId={project.id}
      />
    </div>
  )
}
