import React, { useEffect } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { CheckSquare, Clock, GitBranch, CloudSun, Play, Pause, PlusCircle } from 'lucide-react';

export interface NodeCallbacks {
  onUpdateNodeData: (id: string, patch: Record<string, any>) => void;
  onLogTimeFromNode: (nodeId: string, durationMinutes: number, entryDate: string, title?: string, status?: 'in_progress' | 'completed') => void;
}

// 1. Квадратный нод задачи (Task Node)
export function TaskNode({ id, data }: NodeProps) {
  const d = data as any;
  const callbacks: NodeCallbacks | undefined = d.callbacks;
  const isTicked = Boolean(d.isTicked);
  const status = d.status === 'completed' ? 'completed' : 'in_progress';
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div
      className={`w-[250px] min-h-[235px] rounded bg-[#121215] border-2 shadow-none transition-all duration-300 flex flex-col justify-between ${
        isTicked
          ? 'border-emerald-400  ring-2 ring-zinc-700'
          : status === 'completed'
          ? 'border-emerald-600/80'
          : 'border-indigo-500/80'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!bg-indigo-400"
        title="Вход импульса / времени"
      />

      {/* Заголовок нода в стиле Blueprint */}
      <div
        className={`px-3 py-2 rounded-t flex items-center justify-between text-xs font-bold uppercase tracking-wider ${
          status === 'completed'
            ? 'bg-[#18181b] border-b border-zinc-800 text-emerald-100'
            : 'bg-[#18181b] border-b border-zinc-800 text-zinc-100'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <CheckSquare className="w-4 h-4" />
          Задача
        </span>
        <span className="px-1.5 py-0.5 rounded bg-black/30 text-[10px]">
          Σ {d.totalMinutes || 0} мин
        </span>
      </div>

      {/* Поля внутри квадратного нода */}
      <div className="p-3 space-y-2 text-xs flex-1 flex flex-col justify-between nodrag">
        <div>
          <label className="block text-[10px] text-slate-400 mb-0.5">Название задачи</label>
          <input
            type="text"
            value={d.title ?? 'Новая задача'}
            onChange={(e) => callbacks?.onUpdateNodeData(id, { title: e.target.value })}
            className="w-full bg-[#09090b] border border-zinc-800 rounded px-2 py-1 text-slate-100 focus:outline-none focus:border-indigo-400"
            placeholder="Введите задачу..."
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">Статус</label>
            <select
              value={status}
              onChange={(e) =>
                callbacks?.onUpdateNodeData(id, {
                  status: e.target.value as 'in_progress' | 'completed',
                })
              }
              className="w-full bg-[#09090b] border border-zinc-800 rounded px-1.5 py-1 text-slate-100 focus:outline-none focus:border-indigo-400"
            >
              <option value="in_progress">В работе</option>
              <option value="completed">Выполненная</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">Время (мин)</label>
            <input
              type="number"
              min={1}
              value={d.durationMinutes ?? 30}
              onChange={(e) =>
                callbacks?.onUpdateNodeData(id, {
                  durationMinutes: Math.max(1, Number(e.target.value) || 0),
                })
              }
              className="w-full bg-[#09090b] border border-zinc-800 rounded px-2 py-1 text-slate-100 focus:outline-none focus:border-indigo-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-slate-400 mb-0.5">Дата выполнения</label>
          <input
            type="date"
            value={d.entryDate || today}
            onChange={(e) => callbacks?.onUpdateNodeData(id, { entryDate: e.target.value })}
            className="w-full bg-[#09090b] border border-zinc-800 rounded px-2 py-1 text-slate-100 focus:outline-none focus:border-indigo-400"
          />
        </div>

        <button
          type="button"
          onClick={() =>
            callbacks?.onLogTimeFromNode(
              id,
              Number(d.durationMinutes) || 30,
              d.entryDate || today,
              d.title || 'Новая задача',
              status
            )
          }
          className="w-full mt-1 py-1.5 px-2 rounded bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-white font-semibold flex items-center justify-center gap-1 transition"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          Записать время (+{d.durationMinutes ?? 30}м)
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!bg-emerald-400"
        title="Выход дальше по графу"
      />
    </div>
  );
}

// 2. Нод Времени / Таймера (Time Node)
export function TimeNode({ id, data }: NodeProps) {
  const d = data as any;
  const callbacks: NodeCallbacks | undefined = d.callbacks;
  const isRunning = Boolean(d.isRunning);
  const isTicked = Boolean(d.isTicked);
  const elapsedSeconds = Number(d.elapsedSeconds) || 0;
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      const nextSec = (Number(d.elapsedSeconds) || 0) + 1;
      const bonusMinutes = Math.max(1, Math.ceil(nextSec / 60));
      callbacks?.onUpdateNodeData(id, {
        elapsedSeconds: nextSec,
        durationMinutes: bonusMinutes,
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning, d.elapsedSeconds, id]);

  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;

  return (
    <div
      className={`w-[230px] rounded bg-[#121215] border-2 shadow-none transition-all duration-300 ${
        isTicked
          ? 'border-cyan-400  ring-2 ring-zinc-700'
          : 'border-cyan-600/80'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!bg-cyan-400"
        title="Вход сигнала"
      />

      <div className="px-3 py-2 rounded-t bg-[#18181b] border-b border-zinc-800 text-cyan-100 flex items-center justify-between text-xs font-bold uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <Clock className="w-4 h-4" />
          Время / Таймер
        </span>
        <span className="font-mono text-[11px] bg-black/30 px-1.5 py-0.5 rounded">
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </span>
      </div>

      <div className="p-3 space-y-2 text-xs nodrag">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">Минуты тика</label>
            <input
              type="number"
              min={1}
              value={d.durationMinutes ?? 25}
              onChange={(e) =>
                callbacks?.onUpdateNodeData(id, {
                  durationMinutes: Math.max(1, Number(e.target.value) || 1),
                })
              }
              className="w-full bg-[#09090b] border border-zinc-800 rounded px-2 py-1 text-slate-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">Секундомер</label>
            <button
              type="button"
              onClick={() => callbacks?.onUpdateNodeData(id, { isRunning: !isRunning })}
              className={`w-full py-1 px-2 rounded font-semibold flex items-center justify-center gap-1 ${
                isRunning
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-cyan-700 hover:bg-cyan-600 text-white'
              }`}
            >
              {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isRunning ? 'Пауза' : 'Старт'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-slate-400 mb-0.5">Дата записи</label>
          <input
            type="date"
            value={d.entryDate || today}
            onChange={(e) => callbacks?.onUpdateNodeData(id, { entryDate: e.target.value })}
            className="w-full bg-[#09090b] border border-zinc-800 rounded px-2 py-1 text-slate-100 focus:outline-none focus:border-cyan-400"
          />
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!bg-cyan-400"
        title="Выход времени в нод задачи или условия"
      />
    </div>
  );
}

// 3. Условие (1 вход и 2 выхода: TRUE / FALSE)
export function ConditionNode({ id, data }: NodeProps) {
  const d = data as any;
  const callbacks: NodeCallbacks | undefined = d.callbacks;
  const isTicked = Boolean(d.isTicked);
  const operator = d.operator || '>=';
  const threshold = Number(d.threshold ?? 30);
  const lastResult = d.lastResult;

  return (
    <div
      className={`w-[235px] rounded bg-[#121215] border-2 shadow-none transition-all duration-300 relative ${
        isTicked
          ? 'border-amber-400  ring-2 ring-zinc-700'
          : 'border-amber-600/80'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!bg-amber-400"
        title="Вход (1 вход)"
      />

      <div className="px-3 py-2 rounded-t bg-[#18181b] border-b border-zinc-800 text-amber-100 flex items-center justify-between text-xs font-bold uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <GitBranch className="w-4 h-4" />
          Условие
        </span>
        {lastResult !== undefined && (
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] ${
              lastResult ? 'bg-emerald-500/30 text-emerald-200' : 'bg-rose-500/30 text-rose-200'
            }`}
          >
            {lastResult ? 'TRUE' : 'FALSE'}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2 text-xs nodrag pr-10">
        <div>
          <label className="block text-[10px] text-slate-400 mb-0.5">Проверка времени (мин)</label>
          <div className="flex gap-1.5">
            <select
              value={operator}
              onChange={(e) => callbacks?.onUpdateNodeData(id, { operator: e.target.value })}
              className="bg-[#09090b] border border-zinc-800 rounded px-2 py-1 text-slate-100"
            >
              <option value=">=">&ge;</option>
              <option value="<=">&le;</option>
              <option value="==">=</option>
            </select>
            <input
              type="number"
              value={threshold}
              onChange={(e) =>
                callbacks?.onUpdateNodeData(id, { threshold: Number(e.target.value) || 0 })
              }
              className="w-full bg-[#09090b] border border-zinc-800 rounded px-2 py-1 text-slate-100"
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
          <span>Принудительно:</span>
          <select
            value={d.mode || 'auto'}
            onChange={(e) => callbacks?.onUpdateNodeData(id, { mode: e.target.value })}
            className="bg-[#09090b] border border-zinc-800 rounded px-1.5 py-0.5 text-slate-200"
          >
            <option value="auto">По формуле</option>
            <option value="true">Всегда TRUE</option>
            <option value="false">Всегда FALSE</option>
          </select>
        </div>
      </div>

      {/* Два выходных порта справа: TRUE и FALSE */}
      <div className="absolute right-2 top-[52px] text-[10px] font-bold text-emerald-400 pointer-events-none">
        TRUE
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: 58 }}
        className="!bg-emerald-400"
        title="Выход TRUE"
      />

      <div className="absolute right-2 top-[96px] text-[10px] font-bold text-rose-400 pointer-events-none">
        FALSE
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        style={{ top: 102 }}
        className="!bg-rose-500"
        title="Выход FALSE"
      />
    </div>
  );
}

// 4. Погодный нод (Регион, температура, погода -> 2 выходных нода/порта TRUE и FALSE)
export function WeatherNode({ id, data }: NodeProps) {
  const d = data as any;
  const callbacks: NodeCallbacks | undefined = d.callbacks;
  const isTicked = Boolean(d.isTicked);
  const lastResult = d.lastResult;

  return (
    <div
      className={`w-[255px] rounded bg-[#121215] border-2 shadow-none transition-all duration-300 relative ${
        isTicked
          ? 'border-purple-400  ring-2 ring-zinc-700'
          : 'border-purple-600/80'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!bg-purple-400"
        title="Вход сигнала"
      />

      <div className="px-3 py-2 rounded-t bg-[#18181b] border-b border-zinc-800 text-purple-100 flex items-center justify-between text-xs font-bold uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <CloudSun className="w-4 h-4" />
          Погода
        </span>
        {lastResult !== undefined && (
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] ${
              lastResult ? 'bg-emerald-500/30 text-emerald-200' : 'bg-rose-500/30 text-rose-200'
            }`}
          >
            {lastResult ? 'TRUE' : 'FALSE'}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2 text-xs nodrag pr-11">
        <div>
          <label className="block text-[10px] text-slate-400 mb-0.5">Регион / Город</label>
          <input
            type="text"
            value={d.region ?? 'Москва'}
            onChange={(e) => callbacks?.onUpdateNodeData(id, { region: e.target.value })}
            placeholder="Например, Москва"
            className="w-full bg-[#09090b] border border-zinc-800 rounded px-2 py-1 text-slate-100 focus:outline-none focus:border-purple-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">Температура °C</label>
            <input
              type="number"
              value={d.temperature ?? 20}
              onChange={(e) =>
                callbacks?.onUpdateNodeData(id, { temperature: Number(e.target.value) || 0 })
              }
              className="w-full bg-[#09090b] border border-zinc-800 rounded px-2 py-1 text-slate-100"
            />
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">Погода</label>
            <select
              value={d.weather ?? 'Ясно'}
              onChange={(e) => callbacks?.onUpdateNodeData(id, { weather: e.target.value })}
              className="w-full bg-[#09090b] border border-zinc-800 rounded px-1.5 py-1 text-slate-100"
            >
              <option value="Ясно">Ясно</option>
              <option value="Облачно">Облачно</option>
              <option value="Дождь">Дождь</option>
              <option value="Снег">Снег</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-300">
          <span>Условие погоды:</span>
          <select
            value={d.conditionPass ?? 'true'}
            onChange={(e) => callbacks?.onUpdateNodeData(id, { conditionPass: e.target.value })}
            className="bg-[#09090b] border border-zinc-800 rounded px-1.5 py-0.5 text-slate-100"
          >
            <option value="true">Подходит (TRUE)</option>
            <option value="false">Не подходит (FALSE)</option>
            <option value="temp_above_15">Темп. &ge; 15°C</option>
          </select>
        </div>
      </div>

      {/* Два выходных порта: TRUE и FALSE */}
      <div className="absolute right-2 top-[68px] text-[10px] font-bold text-emerald-400 pointer-events-none">
        TRUE
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: 74 }}
        className="!bg-emerald-400"
        title="Выход TRUE"
      />

      <div className="absolute right-2 top-[122px] text-[10px] font-bold text-rose-400 pointer-events-none">
        FALSE
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        style={{ top: 128 }}
        className="!bg-rose-500"
        title="Выход FALSE"
      />
    </div>
  );
}
