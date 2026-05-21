-- tasks_update policy still checked pr.pm_id = auth.uid() after 022 made pm_id non-authoritative.
-- PMs added via project_managers table were blocked from updating tasks.
-- Fix: check project_managers join table instead of (or in addition to) pm_id.

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;

CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
  USING (
    -- workspace super_admin can update any task
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = tasks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'super_admin'
    )
    -- PM of the project can update its tasks (via project_managers join table)
    OR (
      EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = tasks.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.role = 'pm'
      )
      AND EXISTS (
        SELECT 1 FROM public.project_managers pmg
        WHERE pmg.project_id = tasks.project_id
          AND pmg.user_id = auth.uid()
      )
    )
    -- developer (or any member) can update tasks assigned to them or created by them
    OR tasks.assigned_to = auth.uid()
    OR tasks.created_by = auth.uid()
  );
