import { describe, it, expect } from 'vitest'
import {
  ROLES,
  isSuperAdmin,
  isPM,
  canEditTask,
  canManageProject,
  canAddTask,
  canManageUsers,
  canAccessAdmin,
  canAssignTask,
} from '@/lib/permissions'

const superAdmin = { id: 'sa1', role: 'super_admin' }
const pm = { id: 'pm1', role: 'pm' }
const developer = { id: 'dev1', role: 'developer' }

const task = { id: 't1', assigned_to: 'dev1', created_by: 'pm1', project_id: 'p1' }
const project = { id: 'p1', pm_id: 'pm1' }
const projectMultiPM = { id: 'p1', project_managers: [{ user: { id: 'pm1' } }, { user: { id: 'pm2' } }] }

describe('ROLES constants', () => {
  it('has the three expected roles', () => {
    expect(ROLES.SUPER_ADMIN).toBe('super_admin')
    expect(ROLES.PM).toBe('pm')
    expect(ROLES.DEVELOPER).toBe('developer')
  })
})

describe('isSuperAdmin', () => {
  it('returns true for super_admin', () => expect(isSuperAdmin(superAdmin)).toBe(true))
  it('returns false for pm', () => expect(isSuperAdmin(pm)).toBe(false))
  it('returns false for developer', () => expect(isSuperAdmin(developer)).toBe(false))
  it('returns false for null profile', () => expect(isSuperAdmin(null)).toBe(false))
})

describe('isPM', () => {
  it('returns true for pm', () => expect(isPM(pm)).toBe(true))
  it('returns true for super_admin (hierarchy)', () => expect(isPM(superAdmin)).toBe(true))
  it('returns false for developer', () => expect(isPM(developer)).toBe(false))
  it('returns false for null', () => expect(isPM(null)).toBe(false))
})

describe('canEditTask', () => {
  it('super_admin can always edit', () => {
    expect(canEditTask(superAdmin, task)).toBe(true)
  })

  it('pm can always edit', () => {
    expect(canEditTask(pm, task)).toBe(true)
  })

  it('developer can edit if assigned to them', () => {
    const devTask = { ...task, assigned_to: 'dev1' }
    expect(canEditTask(developer, devTask)).toBe(true)
  })

  it('developer can edit if they created the task', () => {
    const devTask = { id: 't2', assigned_to: 'other', created_by: 'dev1', project_id: 'p1' }
    expect(canEditTask(developer, devTask)).toBe(true)
  })

  it('developer cannot edit task they did not create or own', () => {
    const otherTask = { id: 't3', assigned_to: 'other', created_by: 'another', project_id: 'p1' }
    expect(canEditTask(developer, otherTask)).toBe(false)
  })

  it('returns false for null profile', () => {
    expect(canEditTask(null, task)).toBe(false)
  })
})

describe('canManageProject', () => {
  it('super_admin can manage any project', () => {
    expect(canManageProject(superAdmin, project)).toBe(true)
  })

  it('pm can manage their own project', () => {
    expect(canManageProject(pm, project)).toBe(true)
  })

  it('pm cannot manage a project they do not own', () => {
    const otherProject = { id: 'p2', pm_id: 'other_pm' }
    expect(canManageProject(pm, otherProject)).toBe(false)
  })

  it('pm can manage project via project_managers array', () => {
    expect(canManageProject(pm, projectMultiPM)).toBe(true)
  })

  it('pm cannot manage project when not in project_managers array', () => {
    const other = { id: 'pm3', role: 'pm' }
    expect(canManageProject(other, projectMultiPM)).toBe(false)
  })

  it('developer cannot manage projects', () => {
    expect(canManageProject(developer, project)).toBe(false)
  })

  it('returns false for null profile', () => {
    expect(canManageProject(null, project)).toBe(false)
  })
})

describe('canAddTask', () => {
  it('any profile (including developer) can add tasks', () => {
    expect(canAddTask(developer)).toBe(true)
    expect(canAddTask(pm)).toBe(true)
    expect(canAddTask(superAdmin)).toBe(true)
  })

  it('returns false for null', () => {
    expect(canAddTask(null)).toBe(false)
  })
})

describe('canManageUsers', () => {
  it('super_admin can manage users', () => expect(canManageUsers(superAdmin)).toBe(true))
  it('pm cannot manage users', () => expect(canManageUsers(pm)).toBe(false))
  it('developer cannot manage users', () => expect(canManageUsers(developer)).toBe(false))
})

describe('canAccessAdmin', () => {
  it('super_admin can access admin panel', () => expect(canAccessAdmin(superAdmin)).toBe(true))
  it('pm cannot access admin panel', () => expect(canAccessAdmin(pm)).toBe(false))
  it('developer cannot access admin panel', () => expect(canAccessAdmin(developer)).toBe(false))
})

describe('canAssignTask', () => {
  it('super_admin can assign tasks', () => expect(canAssignTask(superAdmin)).toBe(true))
  it('pm can assign tasks', () => expect(canAssignTask(pm)).toBe(true))
  it('developer cannot assign tasks', () => expect(canAssignTask(developer)).toBe(false))
  it('returns false for null', () => expect(canAssignTask(null)).toBe(false))
})
