-- Developers (assigned_to or created_by) can only update the status field.
-- PMs of the specific project and super_admins have no column restrictions.

CREATE OR REPLACE FUNCTION enforce_task_field_update_restrictions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_is_project_pm BOOLEAN := FALSE;
BEGIN
  SELECT wm.role INTO v_role
  FROM workspace_members wm
  WHERE wm.workspace_id = NEW.workspace_id
    AND wm.user_id = auth.uid();

  IF v_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  IF v_role = 'pm' THEN
    SELECT EXISTS(
      SELECT 1 FROM project_managers pmg
      WHERE pmg.project_id = NEW.project_id
        AND pmg.user_id = auth.uid()
    ) INTO v_is_project_pm;

    IF v_is_project_pm THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Developer (or PM not assigned to this project): only status allowed to change
  IF (OLD.title IS DISTINCT FROM NEW.title)
  OR (OLD.description IS DISTINCT FROM NEW.description)
  OR (OLD.priority IS DISTINCT FROM NEW.priority)
  OR (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  OR (OLD.estimation IS DISTINCT FROM NEW.estimation)
  OR (OLD.url IS DISTINCT FROM NEW.url)
  OR (OLD.deadline IS DISTINCT FROM NEW.deadline) THEN
    RAISE EXCEPTION 'Only the project PM or admin can update task fields other than status.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_task_field_update_restrictions ON public.tasks;

CREATE TRIGGER check_task_field_update_restrictions
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION enforce_task_field_update_restrictions();
