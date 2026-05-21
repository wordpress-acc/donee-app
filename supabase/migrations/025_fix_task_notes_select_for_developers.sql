-- task_notes_select blocked developers who are assigned_to/created_by a task
-- but not in project_members. Extend policy to include them.

DROP POLICY IF EXISTS "task_notes_select" ON public.task_notes;

CREATE POLICY "task_notes_select" ON public.task_notes FOR SELECT TO authenticated
  USING (
    -- project members can see notes
    EXISTS (
      SELECT 1
      FROM tasks t
      JOIN project_members pm ON pm.project_id = t.project_id
      WHERE t.id = task_notes.task_id
        AND pm.user_id = auth.uid()
    )
    -- developers assigned to or who created the task can see notes
    OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_notes.task_id
        AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
    -- PMs of the project can see notes
    OR EXISTS (
      SELECT 1
      FROM tasks t
      JOIN project_managers pmg ON pmg.project_id = t.project_id
      WHERE t.id = task_notes.task_id
        AND pmg.user_id = auth.uid()
    )
    -- workspace super_admin can see all notes
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = task_notes.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'super_admin'
    )
  );
