// Tapşırıq endpoint-ləri.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { TasksService } from './service.js';

export function tasksHandlers(ctx: AppContext): Handlers {
  const tasks = new TasksService(ctx);
  return {
    listTasks: async (req, res) => res.json(await tasks.list(req.auth!, req.valid.query.lesson)),
    createTask: async (req, res) => {
      const t = await tasks.create(req.auth!, req.valid.body);
      res.status(201).location(`/api/v1/tasks/${t.id}`).json(t);
    },
    updateTask: async (req, res) => res.json(await tasks.update(req.auth!, req.valid.params.taskId, req.valid.body)),
    deleteTask: async (req, res) => {
      await tasks.delete(req.valid.params.taskId);
      res.status(204).end();
    },
    setTaskProgress: async (req, res) => res.json(await tasks.setProgress(req.auth!, req.valid.params.taskId, req.valid.body.done)),
    myTaskProgress: async (req, res) => res.json(await tasks.myProgress(req.auth!)),
    importTasks: async (req, res) => res.json(await tasks.import(req)),
  };
}
