// Role hierarchy helpers — used in both client and server contexts.
// workspaceMember: optional { role } from workspace_members table.
// When provided, workspace role takes precedence over profiles.role.

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  PM: 'pm',
  DEVELOPER: 'developer',
}

function effectiveRole(profile, workspaceMember) {
  return workspaceMember?.role ?? profile?.role ?? ROLES.DEVELOPER
}

export function isSuperAdmin(profile, workspaceMember = null) {
  return effectiveRole(profile, workspaceMember) === ROLES.SUPER_ADMIN
}

export function isPM(profile, workspaceMember = null) {
  const role = effectiveRole(profile, workspaceMember)
  return role === ROLES.PM || role === ROLES.SUPER_ADMIN
}

// Can a user edit a task? (status field only for developers)
export function canEditTask(profile, task, workspaceMember = null) {
  if (!profile) return false
  if (isSuperAdmin(profile, workspaceMember)) return true
  if (isPM(profile, workspaceMember)) return true
  return task?.assigned_to === profile.id || task?.created_by === profile.id
}

// Can a user edit all task fields (title, priority, description, etc.)?
// PM of that specific project + super_admin only. Developers are limited to status changes.
export function canEditAllTaskFields(profile, project, workspaceMember = null) {
  if (!profile) return false
  if (isSuperAdmin(profile, workspaceMember)) return true
  return canManageProject(profile, project, workspaceMember)
}

// Can a user delete a task? PM and super_admin only.
export function canDeleteTask(profile, workspaceMember = null) {
  if (!profile) return false
  return isPM(profile, workspaceMember)
}

// Can a user manage project settings (create/edit/archive)?
// project.project_managers should be array of { user: { id } } from project_managers join.
export function canManageProject(profile, project, workspaceMember = null) {
  if (!profile) return false
  if (isSuperAdmin(profile, workspaceMember)) return true
  const role = effectiveRole(profile, workspaceMember)
  if (role === ROLES.PM) {
    const managers = project?.project_managers ?? []
    if (managers.some((m) => (m.user?.id ?? m.user_id) === profile.id)) return true
    // backward compat: fall back to pm_id if project_managers not loaded
    if (managers.length === 0 && project?.pm_id === profile.id) return true
  }
  return false
}

// Can a user add tasks to a project?
export function canAddTask(profile) {
  if (!profile) return false
  return true
}

// Can a user manage users / workspace members?
export function canManageUsers(profile, workspaceMember = null) {
  return isSuperAdmin(profile, workspaceMember)
}

// Can a user access the admin panel?
export function canAccessAdmin(profile, workspaceMember = null) {
  return isSuperAdmin(profile, workspaceMember)
}

// Can a user change task assignment?
export function canAssignTask(profile, workspaceMember = null) {
  if (!profile) return false
  return isSuperAdmin(profile, workspaceMember) || isPM(profile, workspaceMember)
}

// Can a user manage workspace (invites, settings)?
export function canManageWorkspace(workspaceMember) {
  return workspaceMember?.role === ROLES.SUPER_ADMIN
}
