// Tapşırıq endpoint-ləri.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { TasksService } from './service.js';

export function tasksHandlers(ctx: AppContext): Handlers {
  const tasks = new TasksService(ctx);
  return {
    listTasks: (req, res) => res.json(tasks.list(req.auth!, req.valid.query.lesson)),
    createTask: (req, res) => {
      const t = tasks.create(req.auth!, req.valid.body);
      res.status(201).location(`/api/v1/tasks/${t.id}`).json(t);
    },
    updateTask: (req, res) => res.json(tasks.update(req.auth!, req.valid.params.taskId, req.valid.body)),
    deleteTask: (req, res) => {
      tasks.delete(req.valid.params.taskId);
      res.status(204).end();
    },
    setTaskProgress: (req, res) => res.json(tasks.setProgress(req.auth!, req.valid.params.taskId, req.valid.body.done)),
    myTaskProgress: (req, res) => res.json(tasks.myProgress(req.auth!)),
    importTasks: (req, res) => res.json(tasks.import(req)),
  };
}
