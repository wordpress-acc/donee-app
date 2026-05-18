-- Migration 022 — Multi PM per project
-- Replaces single pm_id on projects with a project_managers join table.
-- Existing pm_id data is migrated; pm_id column kept for FK alias compat but is no longer authoritative.
-- Includes fixes from 023 (RLS recursion) and 024 (projects_select super_admin).

-- ── 1. Create project_managers join table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_managers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

ALTER TABLE public.project_managers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_managers TO authenticated;
GRANT ALL ON public.project_managers TO service_role;

-- ── 2. SECURITY DEFINER helper — get workspace_id without triggering projects RLS ──
-- Prevents circular dependency: project_managers_select → projects → project_managers
CREATE OR REPLACE FUNCTION public.get_project_workspace_id(p_project_id UUID)
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT workspace_id FROM public.projects WHERE id = p_project_id;
$$;

-- ── 3. RLS on project_managers ───────────────────────────────────────────────
CREATE POLICY "project_managers_select" ON public.project_managers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = public.get_project_workspace_id(project_managers.project_id)
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "project_managers_insert" ON public.project_managers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = public.get_project_workspace_id(project_managers.project_id)
        AND wm.user_id = auth.uid()
        AND wm.role = 'super_admin'
    )
  );

CREATE POLICY "project_managers_delete" ON public.project_managers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = public.get_project_workspace_id(project_managers.project_id)
        AND wm.user_id = auth.uid()
        AND wm.role = 'super_admin'
    )
  );

-- ── 4. Migrate existing pm_id data ───────────────────────────────────────────
INSERT INTO public.project_managers (project_id, user_id, assigned_by)
SELECT id, pm_id, created_by
FROM public.projects
WHERE pm_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── 5. Update projects_select ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects FOR SELECT TO authenticated
  USING (
    -- global super_admin (profiles.role — consistent with admin layout guard)
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
    -- workspace super_admin (belt+suspenders)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = projects.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'super_admin'
    )
    -- PM sees only projects they manage
    OR EXISTS (
      SELECT 1 FROM public.project_managers mgr
      WHERE mgr.project_id = projects.id AND mgr.user_id = auth.uid()
    )
    -- project members see their projects
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = projects.id AND pm.user_id = auth.uid()
    )
    -- developer assigned to a task in this project
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.project_id = projects.id AND t.assigned_to = auth.uid()
    )
  );

-- ── 6. Update projects_update: PM can update if in project_managers ───────────
DROP POLICY IF EXISTS "projects_update" ON public.projects;
CREATE POLICY "projects_update" ON public.projects FOR UPDATE TO authenticated
  USING (
    -- workspace super_admin
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = projects.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'super_admin'
    )
    -- PM who is a manager of this project
    OR (
      EXISTS (
        SELECT 1 FROM public.project_managers mgr
        WHERE mgr.project_id = projects.id AND mgr.user_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = projects.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.role = 'pm'
      )
    )
  );

-- ── 7. Update notification trigger to notify all project PMs ─────────────────
CREATE OR REPLACE FUNCTION public.handle_task_insert_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project_name TEXT;
  v_creator_name TEXT;
  v_creator_role TEXT;
BEGIN
  SELECT name INTO v_project_name
    FROM public.projects WHERE id = NEW.project_id;

  SELECT full_name, role INTO v_creator_name, v_creator_role
    FROM public.profiles WHERE id = NEW.created_by;

  -- Notify assigned user
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, task_id, message, actor_id)
    VALUES (
      NEW.assigned_to,
      'task_assigned',
      NEW.id,
      'You have been assigned to task: ' || NEW.title
        || ' in project ' || COALESCE(v_project_name, ''),
      NEW.created_by
    );
  END IF;

  -- When a developer creates a task, notify workspace super_admins + all project PMs
  IF v_creator_role = 'developer' THEN
    -- Workspace super_admins
    INSERT INTO public.notifications (user_id, type, task_id, message, actor_id)
    SELECT p.id,
           'task_created',
           NEW.id,
           COALESCE(v_creator_name, 'A developer')
             || ' created task "' || NEW.title
             || '" in ' || COALESCE(v_project_name, 'a project'),
           NEW.created_by
      FROM public.profiles p
      JOIN public.workspace_members wm ON wm.user_id = p.id AND wm.workspace_id = NEW.workspace_id
     WHERE p.role = 'super_admin';

    -- All PMs of this project (skip if PM is the creator)
    INSERT INTO public.notifications (user_id, type, task_id, message, actor_id)
    SELECT mgr.user_id,
           'task_created',
           NEW.id,
           COALESCE(v_creator_name, 'A developer')
             || ' created task "' || NEW.title
             || '" in ' || COALESCE(v_project_name, 'a project'),
           NEW.created_by
      FROM public.project_managers mgr
     WHERE mgr.project_id = NEW.project_id
       AND mgr.user_id <> COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid);
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
