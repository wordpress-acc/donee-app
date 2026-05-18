"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase";
import * as Dialog from "@radix-ui/react-dialog";
import Avatar from "@/components/ui/Avatar";
import { format } from "date-fns";
import {
  Plus,
  Archive,
  ArchiveRestore,
  Pencil,
  X,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PROJECT_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#3b82f6",
];

const INITIAL_FORM = { name: "", description: "", color: "#6366f1", pm_ids: [] };

async function fetchProjects(workspaceId) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      `*,
       project_managers(user:profiles!project_managers_user_id_fkey(id, full_name, avatar_url)),
       members:project_members(user:profiles(id, full_name, avatar_url, role))`,
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

function ProjectFormModal({
  isOpen,
  onClose,
  initialData,
  users,
  onSubmit,
  loading,
}) {
  const [form, setForm] = useState(initialData ?? INITIAL_FORM);

  function update(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  const inputClass =
    "w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400";
  const labelClass =
    "block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5";

  useEffect(() => {
    if (isOpen) setForm(initialData ?? INITIAL_FORM);
  }, [isOpen, initialData]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50 animate-fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl animate-fade-in"
          aria-describedby="project-form-desc"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
            <Dialog.Title className="text-base font-bold text-slate-900 dark:text-slate-100">
              {initialData ? "Edit Project" : "Create Project"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-6 py-5 space-y-4">
            <p id="project-form-desc" className="sr-only">
              Project details form
            </p>
            <div>
              <label className={labelClass}>Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Project name"
                className={inputClass}
                autoFocus
              />
            </div>

            <div>
              <label className={labelClass}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Optional description"
                rows={2}
                className={cn(inputClass, "resize-none")}
              />
            </div>

            <div>
              <label className={labelClass}>Color</label>
              <div className="flex items-center gap-2 flex-wrap">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => update("color", c)}
                    className={cn(
                      "w-7 h-7 rounded-lg transition-all",
                      form.color === c
                        ? "ring-2 ring-offset-2 ring-slate-400 scale-110"
                        : "hover:scale-105",
                    )}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => update("color", e.target.value)}
                  className="w-7 h-7 rounded-lg border-0 cursor-pointer"
                  title="Custom color"
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Project Managers</label>
              <div className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
                {users
                  .filter((u) => u.workspace_role === "pm" || u.workspace_role === "super_admin")
                  .map((u) => {
                    const checked = (form.pm_ids ?? []).includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                          checked
                            ? "bg-indigo-50 dark:bg-indigo-900/20"
                            : "hover:bg-slate-50 dark:hover:bg-slate-700/50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            update(
                              "pm_ids",
                              e.target.checked
                                ? [...(form.pm_ids ?? []), u.id]
                                : (form.pm_ids ?? []).filter((id) => id !== u.id),
                            )
                          }
                          className="w-4 h-4 rounded text-indigo-600 accent-indigo-600"
                        />
                        <span className="text-sm text-slate-800 dark:text-slate-100">{u.full_name}</span>
                        <span className="ml-auto text-xs text-slate-400 capitalize">{u.workspace_role}</span>
                      </label>
                    );
                  })}
                {users.filter((u) => u.workspace_role === "pm" || u.workspace_role === "super_admin").length === 0 && (
                  <p className="px-3 py-2.5 text-sm text-slate-400 italic">No PMs in workspace.</p>
                )}
              </div>
              {(form.pm_ids ?? []).length === 0 && (
                <p className="text-xs text-slate-400 mt-1">No PM assigned.</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={() => onSubmit(form)}
              disabled={!form.name.trim() || loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
            >
              {loading
                ? "Saving…"
                : initialData
                  ? "Save Changes"
                  : "Create Project"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ProjectMembersModal({
  isOpen,
  onClose,
  project,
  users,
  onAdd,
  loading,
}) {
  const [selectedUserId, setSelectedUserId] = useState("");

  const members = (project?.members ?? [])
    .map((m) => m?.user ?? m?.profiles ?? m?.profile ?? m)
    .filter(Boolean);

  const memberIds = new Set(members.map((m) => m.id).filter(Boolean));
  const availableUsers = (users ?? []).filter(
    (u) => u?.id && !memberIds.has(u.id),
  );

  const inputClass =
    "w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400";
  const labelClass =
    "block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5";

  useEffect(() => {
    if (!isOpen) return;
    setSelectedUserId("");
  }, [isOpen, project?.id]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50 animate-fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl animate-fade-in"
          aria-describedby="project-members-desc"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
            <Dialog.Title className="text-base font-bold text-slate-900 dark:text-slate-100">
              Add User to Project
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-6 py-5 space-y-4">
            <p id="project-members-desc" className="sr-only">
              Add an existing user to this project
            </p>

            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                {project?.name ?? "Project"}
              </p>
              {members.length > 0 ? (
                <div className="mt-2 flex -space-x-2">
                  {members.slice(0, 8).map((m) => (
                    <Avatar
                      key={m.id}
                      user={m}
                      size="xs"
                      className="ring-2 ring-white"
                    />
                  ))}
                  {members.length > 8 && (
                    <div className="w-6 h-6 rounded-full bg-slate-200 ring-2 ring-white flex items-center justify-center text-xs text-slate-600 font-medium">
                      +{members.length - 8}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  No members yet.
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>User</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className={inputClass}
              >
                <option value="">— Select user —</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} {u.role ? `(${u.role})` : ""}
                  </option>
                ))}
              </select>
              {availableUsers.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  All users are already members of this project.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={() => onAdd(selectedUserId)}
              disabled={!selectedUserId || loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
            >
              {loading ? "Adding…" : "Add"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function ProjectsTab({ initialProjects, users, workspaceId }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [membersTarget, setMembersTarget] = useState(null);

  const { data: projects } = useQuery({
    queryKey: ["admin-projects", workspaceId],
    queryFn: () => fetchProjects(workspaceId),
    initialData: initialProjects,
  });

  const supabaseMutate = async (fn) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return fn(supabase, user);
  };

  const createProject = useMutation({
    mutationFn: (form) =>
      supabaseMutate(async (supabase, user) => {
        const { data: newProject, error } = await supabase
          .from("projects")
          .insert({
            workspace_id: workspaceId,
            name: form.name,
            description: form.description || null,
            color: form.color,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        const pmIds = form.pm_ids ?? [];
        if (pmIds.length > 0) {
          const { error: pmError } = await supabase.from("project_managers").insert(
            pmIds.map((uid) => ({ project_id: newProject.id, user_id: uid, assigned_by: user.id })),
          );
          if (pmError) throw pmError;
        }
      }),
    onMutate: async (form) => {
      await qc.cancelQueries({ queryKey: ["admin-projects", workspaceId] });
      const prev = qc.getQueryData(["admin-projects", workspaceId]);
      const pmUsers = (form.pm_ids ?? []).map((id) => users?.find((u) => u.id === id)).filter(Boolean);
      qc.setQueryData(["admin-projects", workspaceId], (old) => [
        {
          id: `_temp_${Date.now()}`,
          workspace_id: workspaceId,
          name: form.name,
          description: form.description || null,
          color: form.color,
          is_archived: false,
          created_at: new Date().toISOString(),
          project_managers: pmUsers.map((u) => ({ user: { id: u.id, full_name: u.full_name, avatar_url: u.avatar_url } })),
          members: [],
        },
        ...(old ?? []),
      ]);
      return { prev };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(["admin-projects", workspaceId], ctx.prev);
    },
    onSuccess: () => setCreateOpen(false),
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-projects", workspaceId] }),
  });

  const updateProject = useMutation({
    mutationFn: ({ id, form }) =>
      supabaseMutate(async (supabase, user) => {
        const { error } = await supabase
          .from("projects")
          .update({ name: form.name, description: form.description, color: form.color })
          .eq("id", id);
        if (error) throw error;
        // Replace all project managers
        await supabase.from("project_managers").delete().eq("project_id", id);
        const pmIds = form.pm_ids ?? [];
        if (pmIds.length > 0) {
          const { error: pmError } = await supabase.from("project_managers").insert(
            pmIds.map((uid) => ({ project_id: id, user_id: uid, assigned_by: user.id })),
          );
          if (pmError) throw pmError;
        }
      }),
    onMutate: async ({ id, form }) => {
      await qc.cancelQueries({ queryKey: ["admin-projects", workspaceId] });
      const prev = qc.getQueryData(["admin-projects", workspaceId]);
      const pmUsers = (form.pm_ids ?? []).map((uid) => users?.find((u) => u.id === uid)).filter(Boolean);
      qc.setQueryData(["admin-projects", workspaceId], (old) =>
        (old ?? []).map((p) =>
          p.id === id
            ? {
                ...p,
                name: form.name,
                description: form.description,
                color: form.color,
                project_managers: pmUsers.map((u) => ({ user: { id: u.id, full_name: u.full_name, avatar_url: u.avatar_url } })),
              }
            : p,
        ),
      );
      return { prev };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(["admin-projects", workspaceId], ctx.prev);
    },
    onSuccess: () => setEditTarget(null),
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-projects", workspaceId] }),
  });

  const toggleArchive = useMutation({
    mutationFn: ({ id, archive }) =>
      supabaseMutate(async (supabase) => {
        const { error } = await supabase
          .from("projects")
          .update({ is_archived: archive })
          .eq("id", id);
        if (error) throw error;
      }),
    onMutate: async ({ id, archive }) => {
      await qc.cancelQueries({ queryKey: ["admin-projects", workspaceId] });
      const prev = qc.getQueryData(["admin-projects", workspaceId]);
      qc.setQueryData(["admin-projects", workspaceId], (old) =>
        (old ?? []).map((p) => (p.id === id ? { ...p, is_archived: archive } : p)),
      );
      return { prev };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(["admin-projects", workspaceId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-projects", workspaceId] }),
  });

  const addProjectMember = useMutation({
    mutationFn: ({ projectId, userId }) =>
      supabaseMutate(async (supabase) => {
        const { error } = await supabase
          .from("project_members")
          .upsert(
            { project_id: projectId, user_id: userId },
            { onConflict: "project_id,user_id" },
          );
        if (error) throw error;
      }),
    onMutate: async ({ projectId, userId }) => {
      await qc.cancelQueries({ queryKey: ["admin-projects", workspaceId] });
      const prev = qc.getQueryData(["admin-projects", workspaceId]);
      const user = users?.find((u) => u.id === userId);
      if (user) {
        qc.setQueryData(["admin-projects", workspaceId], (old) =>
          (old ?? []).map((p) =>
            p.id === projectId
              ? { ...p, members: [...(p.members ?? []), { user: { id: user.id, full_name: user.full_name, avatar_url: user.avatar_url } }] }
              : p,
          ),
        );
      }
      return { prev };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(["admin-projects", workspaceId], ctx.prev);
    },
    onSuccess: () => setMembersTarget(null),
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-projects", workspaceId] }),
  });

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {projects.length} projects
        </p>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Project
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  PM
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Created
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Status
                </th>
                <th className="px-5 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {projects.map((project) => (
                <tr
                  key={project.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex-shrink-0"
                        style={{ backgroundColor: project.color ?? "#6366f1" }}
                      />
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-100">
                          {project.name}
                        </p>
                        {project.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                            {project.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {project.project_managers?.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-1">
                          {project.project_managers.slice(0, 3).map((mgr) => (
                            <Avatar key={mgr.user.id} user={mgr.user} size="xs" className="ring-1 ring-white dark:ring-slate-800" />
                          ))}
                        </div>
                        <span className="text-slate-600 dark:text-slate-300 text-sm">
                          {project.project_managers.slice(0, 2).map((m) => m.user.full_name).join(", ")}
                          {project.project_managers.length > 2 && (
                            <span className="text-slate-400"> +{project.project_managers.length - 2}</span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-xs">No PM</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400 text-xs">
                    {project.created_at
                      ? format(new Date(project.created_at), "MMM d, yyyy")
                      : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        project.is_archived
                          ? "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                          : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
                      )}
                    >
                      {project.is_archived ? "Archived" : "Active"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setMembersTarget(project)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        title="Add user"
                      >
                        <UserPlus className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          setEditTarget({
                            id: project.id,
                            form: {
                              name: project.name,
                              description: project.description ?? "",
                              color: project.color ?? "#6366f1",
                              pm_ids: (project.project_managers ?? []).map((m) => m.user.id),
                            },
                          })
                        }
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          toggleArchive.mutate({
                            id: project.id,
                            archive: !project.is_archived,
                          })
                        }
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        title={project.is_archived ? "Unarchive" : "Archive"}
                      >
                        {project.is_archived ? (
                          <ArchiveRestore className="h-4 w-4" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ProjectFormModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        users={users}
        onSubmit={(form) => createProject.mutate(form)}
        loading={createProject.isPending}
      />

      <ProjectFormModal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        initialData={editTarget?.form}
        users={users}
        onSubmit={(form) => updateProject.mutate({ id: editTarget.id, form })}
        loading={updateProject.isPending}
      />

      <ProjectMembersModal
        isOpen={!!membersTarget}
        onClose={() => setMembersTarget(null)}
        project={membersTarget}
        users={users}
        onAdd={(userId) =>
          addProjectMember.mutate({ projectId: membersTarget.id, userId })
        }
        loading={addProjectMember.isPending}
      />
    </>
  );
}
