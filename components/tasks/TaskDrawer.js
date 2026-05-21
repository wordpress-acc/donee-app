"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase";
import { canEditTask, canEditAllTaskFields, canAssignTask } from "@/lib/permissions";
import { cn, truncate } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import PriorityTag from "@/components/ui/PriorityTag";
import StatusTag, { statusConfig } from "@/components/ui/StatusTag";
import ProjectBadge from "@/components/ui/Badge";
import { priorityConfig } from "@/components/ui/PriorityTag";
import RichTextEditor from "@/components/ui/RichTextEditor";
import { formatDistanceToNow } from "date-fns";
import { X, ExternalLink, AtSign, Trash2, Loader2 } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderNoteContent(content) {
  if (!content) return null;
  const parts = content.split(/(@\w[\w\s]*\w|@\w)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span
        key={i}
        className="text-indigo-600 font-medium bg-indigo-50 dark:bg-indigo-900/30 rounded px-0.5"
      >
        {part}
      </span>
    ) : (
      part
    ),
  );
}

// Renders a note body: HTML (new) or plain text with @mentions (legacy)
function NoteBody({ content }) {
  const isHtml = content?.trimStart().startsWith("<");
  return (
    <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed bg-slate-50 dark:bg-slate-700/60 rounded-xl px-3 py-2">
      {isHtml ? (
        <div
          className="rich-text"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      ) : (
        <p className="whitespace-pre-wrap break-words">
          {renderNoteContent(content)}
        </p>
      )}
    </div>
  );
}

// ── Plain text editable field (title, estimation, url) ────────────────────────
function EditableField({ label, value, onSave, canEdit, type = "text" }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value ?? "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setLocal(value ?? "");
  }, [value, editing]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function handleSave() {
    onSave(local);
    setEditing(false);
  }

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
        {label}
      </p>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type={type}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="flex-1 text-sm border border-indigo-300 dark:border-indigo-600 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
          />
          <button
            onClick={handleSave}
            className="text-xs bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => {
              setLocal(value ?? "");
              setEditing(false);
            }}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-1"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div
          onClick={() => canEdit && setEditing(true)}
          className={cn(
            "text-sm text-slate-700 dark:text-slate-200 rounded-lg px-2 py-1.5 -mx-2 min-h-[32px] flex items-center",
            canEdit &&
              "hover:bg-slate-100 dark:hover:bg-slate-700 cursor-text transition-colors",
          )}
        >
          {value ? (
            type === "url" ? (
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline truncate flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {truncate(value, 40)}{" "}
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            ) : (
              <span>{value}</span>
            )
          ) : (
            <span className="text-slate-400 italic text-xs">
              {canEdit ? "Click to add…" : "Not set"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  canEdit,
  renderOption,
}) {
  if (!canEdit) {
    return (
      <div>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
          {label}
        </p>
        {renderOption ? (
          renderOption(value)
        ) : (
          <span className="text-sm text-slate-700 dark:text-slate-200">
            {value ?? "—"}
          </span>
        )}
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
        {label}
      </p>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 w-full"
      >
        <option value="">— None —</option>
        {options.map((opt) => (
          <option key={opt.value ?? opt.id} value={opt.value ?? opt.id}>
            {opt.label ?? opt.full_name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────
export default function TaskDrawer({ task, taskNotFound = false, isOpen, onClose, profile, workspaceMember, projects, users }) {
  const qc = useQueryClient();
  const overlayRef = useRef(null);
  const [descEditing, setDescEditing] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);

  // Reset description edit state when task changes
  useEffect(() => {
    setDescEditing(false);
    setEditingNoteId(null);
  }, [task?.id]);

  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ["notes", task?.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("task_notes")
        .select(
          "*, author:profiles!task_notes_author_id_fkey(id, full_name, avatar_url)",
        )
        .eq("task_id", task.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!task?.id && isOpen,
  });

  const updateTask = useMutation({
    mutationFn: async (updates) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const addNote = useMutation({
    mutationFn: async (content) => {
      const supabase = createClient();
      const { error } = await supabase.from("task_notes").insert({
        task_id: task.id,
        author_id: profile.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", task.id] }),
  });

  const updateNote = useMutation({
    mutationFn: async ({ noteId, content }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("task_notes")
        .update({ content })
        .eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["notes", task.id] });
      setEditingNoteId(null);
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("task_notes")
        .delete()
        .eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: async (_, noteId) => {
      await qc.invalidateQueries({ queryKey: ["notes", task.id] });
      setEditingNoteId((prev) => (prev === noteId ? null : prev));
    },
  });

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canEditStatus = canEditTask(profile, task, workspaceMember);
  const taskProject = projects?.find((p) => p.id === task?.project_id) ?? task?.project ?? null;
  const canEditAllFields = canEditAllTaskFields(profile, taskProject, workspaceMember);
  const canAssign = canAssignTask(profile, workspaceMember);
  const projectMembers = users ?? [];

  if (taskNotFound) {
    return (
      <>
        {isOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-40 animate-fade-in"
            onClick={onClose}
          />
        )}
        <div
          className={cn(
            "fixed top-0 right-0 h-full z-50 flex flex-col bg-white dark:bg-slate-800 shadow-2xl transition-transform duration-300 ease-out",
            "w-full sm:w-[520px]",
            isOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Task not found</span>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <Trash2 className="h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="text-base font-medium text-slate-600 dark:text-slate-300">This task has been deleted</p>
            <p className="text-sm text-slate-400 dark:text-slate-500">It may have been removed by another team member.</p>
          </div>
        </div>
      </>
    );
  }

  if (!task) {
    return (
      <>
        {isOpen && (
          <div className="fixed inset-0 bg-black/30 z-40 animate-fade-in" onClick={onClose} />
        )}
        <div
          className={cn(
            "fixed top-0 right-0 h-full z-50 flex flex-col bg-white dark:bg-slate-800 shadow-2xl transition-transform duration-300 ease-out",
            "w-full sm:w-[520px]",
            isOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <div className="skeleton h-5 w-48 rounded-md" />
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        </div>
      </>
    )
  }

  const priorityOptions = Object.entries(priorityConfig).map(
    ([value, { label }]) => ({ value, label }),
  );
  const statusOptions = Object.entries(statusConfig).map(
    ([value, { label }]) => ({ value, label }),
  );
  const userOptions =
    users?.map((u) => ({ value: u.id, label: u.full_name })) ?? [];

  return (
    <>
      {isOpen && (
        <div
          ref={overlayRef}
          className="fixed inset-0 bg-black/30 z-40 animate-fade-in"
          onClick={onClose}
        />
      )}

      <div
        className={cn(
          "fixed top-0 right-0 h-full z-50 flex flex-col bg-white dark:bg-slate-800 shadow-2xl transition-transform duration-300 ease-out",
          "w-full sm:w-[520px]",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
        aria-label="Task detail"
        role="dialog"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex-1 min-w-0">
            {canEditAllFields ? (
              <EditableField
                label=""
                value={task.title}
                onSave={(v) => v && updateTask.mutate({ title: v })}
                canEdit={canEditAllFields}
              />
            ) : (
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {task.title}
              </h2>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {task.project && <ProjectBadge project={task.project} />}
              <PriorityTag priority={task.priority} />
              <StatusTag status={task.status} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex-shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Priority"
              value={task.priority}
              options={priorityOptions}
              onChange={(v) => updateTask.mutate({ priority: v })}
              canEdit={canEditAllFields}
              renderOption={(v) => <PriorityTag priority={v} />}
            />
            <SelectField
              label="Status"
              value={task.status}
              options={statusOptions}
              onChange={(v) => v && updateTask.mutate({ status: v })}
              canEdit={canEditStatus}
              renderOption={(v) => <StatusTag status={v} />}
            />
          </div>

          <SelectField
            label="Assigned To"
            value={task.assigned_to}
            options={userOptions}
            onChange={(v) => updateTask.mutate({ assigned_to: v })}
            canEdit={canAssign}
            renderOption={(v) => {
              const u = users?.find((u) => u.id === v);
              return u ? (
                <div className="flex items-center gap-2">
                  <Avatar user={u} size="xs" />
                  <span className="text-sm text-slate-700 dark:text-slate-200">
                    {u.full_name}
                  </span>
                </div>
              ) : (
                <span className="text-slate-400 italic text-xs">
                  Unassigned
                </span>
              );
            }}
          />

          <EditableField
            label="Estimation"
            value={task.estimation}
            onSave={(v) => updateTask.mutate({ estimation: v })}
            canEdit={canEditAllFields}
          />
          <EditableField
            label="URL"
            value={task.url}
            type="url"
            onSave={(v) => updateTask.mutate({ url: v })}
            canEdit={canEditAllFields}
          />
          <EditableField
            label="Deadline"
            value={task.deadline}
            type="date"
            onSave={(v) => updateTask.mutate({ deadline: v || null })}
            canEdit={canEditAllFields}
          />

          {/* Description — WYSIWYG */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Description
            </p>
            {descEditing ? (
              <RichTextEditor
                key={`desc-${task.id}`}
                content={task.description}
                editable
                placeholder="Add a description…"
                onSave={(html) => {
                  updateTask.mutate({ description: html });
                  setDescEditing(false);
                }}
                onCancel={() => setDescEditing(false)}
              />
            ) : (
              <div
                onClick={() => canEditAllFields && setDescEditing(true)}
                className={cn(
                  "text-sm rounded-lg px-2 py-1.5 -mx-2 min-h-[40px]",
                  canEditAllFields &&
                    "hover:bg-slate-100 dark:hover:bg-slate-700 cursor-text transition-colors",
                )}
              >
                {task.description ? (
                  <div
                    className="rich-text text-slate-700 dark:text-slate-200"
                    dangerouslySetInnerHTML={{ __html: task.description }}
                  />
                ) : (
                  <span className="text-slate-400 italic text-xs">
                    {canEditAllFields ? "Click to add description…" : "No description"}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="text-xs text-slate-400 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-700">
            <p>
              Created{" "}
              {task.created_at
                ? formatDistanceToNow(new Date(task.created_at), {
                    addSuffix: true,
                  })
                : "—"}
            </p>
            <p>
              Updated{" "}
              {task.updated_at
                ? formatDistanceToNow(new Date(task.updated_at), {
                    addSuffix: true,
                  })
                : "—"}
            </p>
          </div>

          {/* Notes thread */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
              <AtSign className="h-3.5 w-3.5" />
              Notes ({notes.length})
            </h3>

            {notesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-8 h-8 skeleton rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-3 w-24" />
                      <div className="skeleton h-4 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notes.length === 0 ? (
              <p className="text-slate-400 text-sm italic mb-4">
                No notes yet. Be the first to comment.
              </p>
            ) : (
              <div className="space-y-4 mb-4">
                {notes.map((note) => (
                  <div key={note.id} className="flex gap-3">
                    <Avatar
                      user={note.author}
                      size="sm"
                      className="flex-shrink-0 mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {note.author?.full_name}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatDistanceToNow(new Date(note.created_at), {
                            addSuffix: true,
                          })}
                        </span>
                        {note.author_id === profile?.id && (
                          <div className="ml-auto flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setEditingNoteId(note.id)}
                              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!window.confirm("Delete this note?"))
                                  return;
                                deleteNote.mutate(note.id);
                              }}
                              disabled={deleteNote.isPending}
                              className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label="Delete note"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      {editingNoteId === note.id ? (
                        <RichTextEditor
                          key={`note-edit-${note.id}`}
                          content={note.content}
                          editable
                          placeholder="Edit your note…"
                          users={projectMembers}
                          onSave={(html) =>
                            updateNote.mutate({
                              noteId: note.id,
                              content: html,
                            })
                          }
                          onCancel={() => setEditingNoteId(null)}
                        />
                      ) : (
                        <NoteBody content={note.content} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Note input — WYSIWYG */}
            <RichTextEditor
              key={task.id}
              editable
              placeholder="Write a note… paste a screenshot or @ to mention someone"
              users={projectMembers}
              onSubmit={(html) => addNote.mutate(html)}
              submitLabel="Send"
            />
          </div>
        </div>
      </div>
    </>
  );
}
