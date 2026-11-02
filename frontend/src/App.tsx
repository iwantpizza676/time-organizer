import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Plus,
  Trash2,
  Play,
  Repeat,
  ListChecks,
  CheckSquare,
  Clock,
  GitBranch,
  CloudSun,
  LogOut,
  Save,
  Calendar,
  Edit3,
  CheckCircle2,
  CircleDot,
  FolderKanban,
} from 'lucide-react';
import { TaskNode, TimeNode, ConditionNode, WeatherNode, NodeCallbacks } from './CustomNodes';

interface User {
  id: string;
  login: string;
}

interface ScenarioItem {
  id: string;
  title: string;
  updated_at: string;
  graph_data?: {
    nodes: Node[];
    edges: Edge[];
  };
}

interface TaskSummary {
  id: string;
  title: string;
  status: 'in_progress' | 'completed';
  scenario_id: string | null;
  node_id: string | null;
  total_minutes: number;
  entries_count: number;
}

interface TimeEntryItem {
  id: string;
  task_id: string;
  task_title?: string;
  task_status?: 'in_progress' | 'completed';
  entry_date: string;
  duration_minutes: number;
  source_node_id?: string | null;
  note?: string | null;
}

const nodeTypes = {
  taskNode: TaskNode,
  timeNode: TimeNode,
  conditionNode: ConditionNode,
  weatherNode: WeatherNode,
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  // Сценарии и граф
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [scenarioTitle, setScenarioTitle] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const isLoadedRef = useRef(false);
  const saveTimerRef = useRef<any>(null);

  // Режим тиканья слева направо
  const [autoTick, setAutoTick] = useState(false);
  const [tickLog, setTickLog] = useState<string>('Готов к запуску тика слева направо');

  // Модальное окно / вкладка отчетов органайзера
  const [activeTab, setActiveTab] = useState<'canvas' | 'organizer'>('canvas');
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [allEntries, setAllEntries] = useState<TimeEntryItem[]>([]);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<{
    id: string;
    title: string;
    status: 'in_progress' | 'completed';
    total_minutes: number;
    entries: TimeEntryItem[];
  } | null>(null);

  // Поля создания / добавления времени в разделе органайзера
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newTaskMinutes, setNewTaskMinutes] = useState(30);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');

  // Проверка текущей сессии
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  // Загрузка данных органайзера (задачи и все записи)
  const fetchOrganizerData = useCallback(async () => {
    const [tasksRes, entriesRes] = await Promise.all([
      fetch('/api/tasks', { credentials: 'include' }),
      fetch('/api/time-entries', { credentials: 'include' }),
    ]);
    if (tasksRes.ok) {
      const tData = await tasksRes.json();
      setTasks(tData.tasks || []);
      // Обновляем суммарные минуты на нодах задач на канвасе
      setNodes((prev) =>
        prev.map((n) => {
          if (n.type !== 'taskNode') return n;
          const match = (tData.tasks || []).find((t: TaskSummary) => t.node_id === n.id);
          if (!match) return n;
          return {
            ...n,
            data: {
              ...n.data,
              totalMinutes: match.total_minutes,
              title: match.title,
              status: match.status,
            },
          };
        })
      );
    }
    if (entriesRes.ok) {
      const eData = await entriesRes.json();
      setAllEntries(eData.entries || []);
    }
  }, [setNodes]);

  // Обновление данных внутри конкретного нода
  const onUpdateNodeData = useCallback(
    (nodeId: string, patch: Record<string, any>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n))
      );
      setSaveStatus('unsaved');
    },
    [setNodes]
  );

  // Запись времени из нода задачи или при тике графа
  const onLogTimeFromNode = useCallback(
    async (
      nodeId: string,
      durationMinutes: number,
      entryDate: string,
      title?: string,
      status?: 'in_progress' | 'completed'
    ) => {
      if (!activeScenarioId) return;
      const res = await fetch('/api/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          scenario_id: activeScenarioId,
          node_id: nodeId,
          task_title: title,
          task_status: status,
          entry_date: entryDate,
          duration_minutes: durationMinutes,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, totalMinutes: data.total_minutes } } : n
          )
        );
        fetchOrganizerData();
        setTickLog(`Записано +${durationMinutes} мин в задачу «${title || 'Задача'}» (${entryDate})`);
      }
    },
    [activeScenarioId, fetchOrganizerData, setNodes]
  );

  const callbacks: NodeCallbacks = useMemo(
    () => ({ onUpdateNodeData, onLogTimeFromNode }),
    [onUpdateNodeData, onLogTimeFromNode]
  );

  // Прокидываем callbacks во все ноды
  const nodesWithCallbacks = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: { ...n.data, callbacks },
      })),
    [nodes, callbacks]
  );

  // Загрузка списка сценариев при входе
  useEffect(() => {
    if (!user) return;
    fetch('/api/scenarios', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const list: ScenarioItem[] = data.scenarios || [];
        setScenarios(list);
        if (list.length > 0) {
          loadScenario(list[0].id);
        }
      });
    fetchOrganizerData();
  }, [user]);

  // Загрузка выбранного сценария
  const loadScenario = async (id: string) => {
    isLoadedRef.current = false;
    const res = await fetch(`/api/scenarios/${id}`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const sc: ScenarioItem = data.scenario;
    setActiveScenarioId(sc.id);
    setScenarioTitle(sc.title);
    const g = sc.graph_data || { nodes: [], edges: [] };
    setNodes(Array.isArray(g.nodes) ? g.nodes : []);
    setEdges(Array.isArray(g.edges) ? g.edges : []);
    setSaveStatus('saved');
    setTimeout(() => {
      isLoadedRef.current = true;
      fetchOrganizerData();
    }, 150);
  };

  // Автосохранение графа в JSON на сервере при любом действии пользователя
  useEffect(() => {
    if (!user || !activeScenarioId || !isLoadedRef.current) return;
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      // Очищаем служебные callbacks перед сериализацией в JSON
      const serializedNodes = nodes.map((n) => {
        const { callbacks: _cb, isTicked: _tk, ...cleanData } = (n.data || {}) as any;
        return {
          id: n.id,
          type: n.type,
          position: n.position,
          measured: n.measured || { width: 240, height: 180 },
          data: cleanData,
        };
      });

      const graphPayload = {
        title: scenarioTitle,
        graph_data: {
          nodes: serializedNodes,
          edges,
        },
      };

      const res = await fetch(`/api/scenarios/${activeScenarioId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(graphPayload),
      });

      if (res.ok) {
        setSaveStatus('saved');
        setScenarios((prev) =>
          prev.map((s) => (s.id === activeScenarioId ? { ...s, title: scenarioTitle } : s))
        );
        fetchOrganizerData();
      }
    }, 400);

    return () => clearTimeout(saveTimerRef.current);
  }, [nodes, edges, scenarioTitle, activeScenarioId, user]);

  // Соединение нодов линией
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2.5 },
          },
          eds
        )
      );
      setSaveStatus('unsaved');
    },
    [setEdges]
  );

  // Drag & Drop новых нодов из правой палитры на канвас
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const position = {
        x: event.clientX - bounds.left - 110,
        y: event.clientY - bounds.top - 60,
      };

      const today = new Date().toISOString().slice(0, 10);
      const newId = `node_${Date.now()}`;

      const defaultDataByType: Record<string, any> = {
        taskNode: {
          title: 'Новая задача',
          status: 'in_progress',
          durationMinutes: 30,
          entryDate: today,
          totalMinutes: 0,
        },
        timeNode: {
          durationMinutes: 25,
          entryDate: today,
          elapsedSeconds: 0,
          isRunning: false,
        },
        conditionNode: {
          operator: '>=',
          threshold: 20,
          mode: 'auto',
        },
        weatherNode: {
          region: 'Москва',
          temperature: 22,
          weather: 'Ясно',
          conditionPass: 'true',
        },
      };

      const newNode: Node = {
        id: newId,
        type,
        position,
        data: defaultDataByType[type] || {},
      };

      setNodes((nds) => [...nds, newNode]);
      setSaveStatus('unsaved');
    },
    [setNodes]
  );

  // ДВИЖОК ТИКАНЬЯ ГРАФА СЛЕВА НАПРАВО
  const runGraphTickLeftToRight = useCallback(async () => {
    if (nodes.length === 0) return;

    // Сортируем ноды по координате X слева направо
    const sorted = [...nodes].sort((a, b) => a.position.x - b.position.x);

    // Определяем корни (ноды без входящих связей)
    const incomingCount = new Map<string, number>();
    nodes.forEach((n) => incomingCount.set(n.id, 0));
    edges.forEach((e) => incomingCount.set(e.target, (incomingCount.get(e.target) || 0) + 1));

    const activeNodeIds = new Set<string>();
    const carriedPayload = new Map<string, { minutes: number; date: string }>();
    const today = new Date().toISOString().slice(0, 10);

    // Все стартовые левые ноды активируются в начале тика
    for (const n of sorted) {
      if ((incomingCount.get(n.id) || 0) === 0) {
        activeNodeIds.add(n.id);
        carriedPayload.set(n.id, {
          minutes: Number((n.data as any)?.durationMinutes) || 25,
          date: (n.data as any)?.entryDate || today,
        });
      }
    }

    const updatedResults = new Map<string, boolean>();
    let loggedTasksCount = 0;

    for (const node of sorted) {
      if (!activeNodeIds.has(node.id)) continue;
      const d = (node.data || {}) as any;
      const incoming = carriedPayload.get(node.id) || {
        minutes: Number(d.durationMinutes) || 25,
        date: d.entryDate || today,
      };

      if (node.type === 'timeNode') {
        const mins = Number(d.durationMinutes) || 25;
        const dt = d.entryDate || today;
        carriedPayload.set(node.id, { minutes: mins, date: dt });

        edges
          .filter((e) => e.source === node.id)
          .forEach((e) => {
            activeNodeIds.add(e.target);
            carriedPayload.set(e.target, { minutes: mins, date: dt });
          });
      } else if (node.type === 'weatherNode') {
        let pass = true;
        if (d.conditionPass === 'false') pass = false;
        else if (d.conditionPass === 'temp_above_15') pass = Number(d.temperature ?? 20) >= 15;
        updatedResults.set(node.id, pass);

        const branchHandle = pass ? 'true' : 'false';
        edges
          .filter((e) => e.source === node.id && (e.sourceHandle || 'true') === branchHandle)
          .forEach((e) => {
            activeNodeIds.add(e.target);
            carriedPayload.set(e.target, incoming);
          });
      } else if (node.type === 'conditionNode') {
        let pass = true;
        if (d.mode === 'true') pass = true;
        else if (d.mode === 'false') pass = false;
        else {
          const val = incoming.minutes;
          const thr = Number(d.threshold ?? 20);
          if (d.operator === '<=') pass = val <= thr;
          else if (d.operator === '==') pass = val === thr;
          else pass = val >= thr;
        }
        updatedResults.set(node.id, pass);

        const branchHandle = pass ? 'true' : 'false';
        edges
          .filter((e) => e.source === node.id && (e.sourceHandle || 'true') === branchHandle)
          .forEach((e) => {
            activeNodeIds.add(e.target);
            carriedPayload.set(e.target, incoming);
          });
      } else if (node.type === 'taskNode') {
        const minsToLog = incoming.minutes || Number(d.durationMinutes) || 30;
        const dateToLog = incoming.date || d.entryDate || today;
        await onLogTimeFromNode(
          node.id,
          minsToLog,
          dateToLog,
          d.title || 'Задача',
          d.status === 'completed' ? 'completed' : 'in_progress'
        );
        loggedTasksCount++;

        edges
          .filter((e) => e.source === node.id)
          .forEach((e) => {
            activeNodeIds.add(e.target);
            carriedPayload.set(e.target, { minutes: minsToLog, date: dateToLog });
          });
      }
    }

    // Подсвечиваем активные ноды на 900 мс
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          isTicked: activeNodeIds.has(n.id),
          ...(updatedResults.has(n.id) ? { lastResult: updatedResults.get(n.id) } : {}),
        },
      }))
    );

    setTimeout(() => {
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: { ...n.data, isTicked: false },
        }))
      );
    }, 900);

    setTickLog(
      `Тик прошел слева направо: активно нодов ${activeNodeIds.size}, обновлено задач: ${loggedTasksCount}`
    );
  }, [nodes, edges, onLogTimeFromNode, setNodes]);

  useEffect(() => {
    if (!autoTick) return;
    const timer = setInterval(() => {
      runGraphTickLeftToRight();
    }, 5000);
    return () => clearInterval(timer);
  }, [autoTick, runGraphTickLeftToRight]);

  // Создание нового сценария
  const handleCreateScenario = async () => {
    const res = await fetch('/api/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: `Сценарий #${scenarios.length + 1}` }),
    });
    if (res.ok) {
      const data = await res.json();
      setScenarios((prev) => [data.scenario, ...prev]);
      loadScenario(data.scenario.id);
      setActiveTab('canvas');
    }
  };

  // Удаление сценария
  const handleDeleteScenario = async (id: string) => {
    if (scenarios.length <= 1) return;
    await fetch(`/api/scenarios/${id}`, { method: 'DELETE', credentials: 'include' });
    const next = scenarios.filter((s) => s.id !== id);
    setScenarios(next);
    if (activeScenarioId === id && next[0]) {
      loadScenario(next[0].id);
    }
  };

  // Просмотр дат и суммарного времени по выбранной задаче
  const openTaskDetails = async (taskId: string) => {
    const res = await fetch(`/api/tasks/${taskId}`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setSelectedTaskDetail(data.task);
    }
  };

  // Добавление задачи / записи времени из панели органайзера
  const handleCreateTaskManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title: newTaskTitle.trim(),
        entry_date: newTaskDate,
        duration_minutes: newTaskMinutes,
      }),
    });
    if (res.ok) {
      setNewTaskTitle('');
      fetchOrganizerData();
    }
  };

  // Изменение статуса задачи (в работе / выполненная)
  const handleToggleTaskStatus = async (task: TaskSummary) => {
    const nextStatus = task.status === 'in_progress' ? 'completed' : 'in_progress';
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: nextStatus }),
    });
    fetchOrganizerData();
    if (selectedTaskDetail?.id === task.id) {
      openTaskDetails(task.id);
    }
  };

  // Сохранение отредактированного названия задачи
  const handleSaveTaskTitle = async (taskId: string) => {
    if (!editingTaskTitle.trim()) return;
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: editingTaskTitle.trim() }),
    });
    setEditingTaskId(null);
    fetchOrganizerData();
    if (selectedTaskDetail?.id === taskId) {
      openTaskDetails(taskId);
    }
  };

  // Удаление задачи
  const handleDeleteTask = async (taskId: string) => {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE', credentials: 'include' });
    if (selectedTaskDetail?.id === taskId) setSelectedTaskDetail(null);
    fetchOrganizerData();
  };

  // Добавление новой записи времени к существующей задаче
  const handleAddEntryToSelectedTask = async () => {
    if (!selectedTaskDetail) return;
    await fetch('/api/time-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        task_id: selectedTaskDetail.id,
        entry_date: newTaskDate,
        duration_minutes: newTaskMinutes,
      }),
    });
    openTaskDetails(selectedTaskDetail.id);
    fetchOrganizerData();
  };

  // Вход / Регистрация
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ login: loginInput.trim(), password: passwordInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthError(data.error || 'Ошибка авторизации');
      return;
    }
    setUser(data.user);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0f14] text-slate-300">
        Загрузка органайзера...
      </div>
    );
  }

  // Экран авторизации по логину и паролю
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0f14] p-4">
        <div className="w-full max-w-md bg-[#161922] border border-slate-800 rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-lg">
              ⏱
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Личный органайзер времени</h1>
              <p className="text-xs text-slate-400">Нодовый редактор сценариев и учет задач</p>
            </div>
          </div>

          <div className="flex rounded-lg bg-[#0d0f14] p-1 mb-6">
            <button
              type="button"
              onClick={() => setAuthMode('login')}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition ${
                authMode === 'login' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              Вход
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('register')}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition ${
                authMode === 'register' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              Регистрация
            </button>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Логин</label>
              <input
                type="text"
                required
                value={loginInput}
                onChange={(e) => setLoginInput(e.target.value)}
                placeholder="例如: admin"
                className="w-full bg-[#0d0f14] border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Пароль</label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Минимум 4 символа"
                className="w-full bg-[#0d0f14] border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition"
            >
              {authMode === 'login' ? 'Войти в органайзер' : 'Создать аккаунт'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const tasksInProgress = tasks.filter((t) => t.status === 'in_progress');
  const tasksCompleted = tasks.filter((t) => t.status === 'completed');

  return (
    <ReactFlowProvider>
      <div className="h-screen w-screen flex overflow-hidden bg-[#0e1015] text-slate-100">
        {/* ЛЕВОЕ МЕНЮ: Список сценариев и переключение вкладок */}
        <aside className="w-64 bg-[#151821] border-r border-slate-800 flex flex-col justify-between shrink-0">
          <div className="p-4 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="font-bold text-sm tracking-wide text-white flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-indigo-400" />
                Органайзер времени
              </div>
            </div>

            {/* Переключатель режима: Нодовый канвас / Отчеты и списки задач */}
            <div className="grid grid-cols-2 gap-1 bg-[#0e1015] p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('canvas')}
                className={`py-1.5 px-2 rounded text-xs font-semibold transition ${
                  activeTab === 'canvas'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Нод-Канвас
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('organizer');
                  fetchOrganizerData();
                }}
                className={`py-1.5 px-2 rounded text-xs font-semibold transition flex items-center justify-center gap-1 ${
                  activeTab === 'organizer'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ListChecks className="w-3.5 h-3.5" />
                Задачи ({tasks.length})
              </button>
            </div>

            {/* Кнопка создания нового сценария */}
            <button
              type="button"
              onClick={handleCreateScenario}
              className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow"
            >
              <Plus className="w-4 h-4" />
              Новый сценарий
            </button>

            {/* Список сценариев пользователя */}
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                Мои сценарии
              </div>
              {scenarios.map((sc) => (
                <div
                  key={sc.id}
                  onClick={() => {
                    loadScenario(sc.id);
                    setActiveTab('canvas');
                  }}
                  className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition ${
                    activeScenarioId === sc.id
                      ? 'bg-indigo-600/20 border border-indigo-500/50 text-white font-semibold'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <span className="truncate">{sc.title}</span>
                  {scenarios.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteScenario(sc.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-400 transition"
                      title="Удалить сценарий"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Нижний блок с пользователем и статусом сохранения JSON */}
          <div className="p-4 border-t border-slate-800 space-y-2 bg-[#11131a]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Save className="w-3.5 h-3.5 text-emerald-400" />
                JSON графа:
              </span>
              <span
                className={`font-semibold ${
                  saveStatus === 'saved'
                    ? 'text-emerald-400'
                    : saveStatus === 'saving'
                    ? 'text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                {saveStatus === 'saved'
                  ? 'Сохранено в БД'
                  : saveStatus === 'saving'
                  ? 'Сохранение...'
                  : 'Изменено'}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
              <span className="font-medium text-slate-200 truncate">👤 {user.login}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="text-slate-400 hover:text-rose-400 flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                Выйти
              </button>
            </div>
          </div>
        </aside>

        {/* ЦЕНТРАЛЬНАЯ ОБЛАСТЬ */}
        {activeTab === 'canvas' ? (
          <div className="flex-1 flex flex-col h-full relative">
            {/* Верхний тулбар сценария и управления тиками слева направо */}
            <header className="h-14 bg-[#151821] border-b border-slate-800 px-4 flex items-center justify-between gap-4 z-10">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={scenarioTitle}
                  onChange={(e) => {
                    setScenarioTitle(e.target.value);
                    setSaveStatus('unsaved');
                  }}
                  className="bg-[#0e1015] border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-semibold text-white focus:outline-none focus:border-indigo-500"
                />
                <span className="text-xs text-slate-400 hidden md:inline">{tickLog}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={runGraphTickLeftToRight}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
                >
                  <Play className="w-3.5 h-3.5" />
                  Тик графа (слева ➔ направо)
                </button>

                <button
                  type="button"
                  onClick={() => setAutoTick(!autoTick)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${
                    autoTick
                      ? 'bg-cyan-600/20 border-cyan-400 text-cyan-200'
                      : 'bg-[#0e1015] border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <Repeat className="w-3.5 h-3.5" />
                  {autoTick ? 'Авто-тик: ВКЛ (5с)' : 'Авто-тик: ВЫКЛ'}
                </button>
              </div>
            </header>

            {/* Поле канваса с сеткой позади */}
            <div className="flex-1 flex relative">
              <div className="flex-1 h-full" onDrop={onDrop} onDragOver={onDragOver}>
                <ReactFlow
                  nodes={nodesWithCallbacks}
                  edges={edges}
                  onNodesChange={(changes) => {
                    onNodesChange(changes);
                    setSaveStatus('unsaved');
                  }}
                  onEdgesChange={(changes) => {
                    onEdgesChange(changes);
                    setSaveStatus('unsaved');
                  }}
                  onConnect={onConnect}
                  nodeTypes={nodeTypes}
                  fitView
                  deleteKeyCode={['Backspace', 'Delete']}
                  className="bg-[#0f1219]"
                >
                  <Background
                    variant={BackgroundVariant.Lines}
                    gap={28}
                    size={1}
                    color="#1e2433"
                  />
                  <Controls className="!bg-[#151821] !border-slate-700 !text-white" />
                  <MiniMap
                    nodeColor="#4f46e5"
                    maskColor="rgba(15, 18, 25, 0.75)"
                    className="!bg-[#151821] !border !border-slate-700"
                  />
                </ReactFlow>
              </div>

              {/* ПРАВАЯ ПАЛИТРА ЭЛЕМЕНТОВ (Blender / Unreal Blueprints style) */}
              <aside className="w-72 bg-[#151821] border-l border-slate-800 p-4 flex flex-col justify-between shrink-0 overflow-y-auto">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Палитра нодов
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Перетащите блок на сетку канваса слева и соедините порты
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {/* 1. Квадратный нод задачи */}
                    <div
                      draggable
                      onDragStart={(e) => onDragStart(e, 'taskNode')}
                      className="p-3 rounded-xl bg-[#1c202c] border border-indigo-500/50 hover:border-indigo-400 cursor-grab active:cursor-grabbing transition shadow"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                        <CheckSquare className="w-4 h-4" />
                        Квадратный нод задачи
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Название, статус («в работе» / «выполненная»), дата и затраченное время.
                      </p>
                    </div>

                    {/* 2. Нод времени / таймера */}
                    <div
                      draggable
                      onDragStart={(e) => onDragStart(e, 'timeNode')}
                      className="p-3 rounded-xl bg-[#1c202c] border border-cyan-500/50 hover:border-cyan-400 cursor-grab active:cursor-grabbing transition shadow"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                        <Clock className="w-4 h-4" />
                        Нод времени / таймера
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Задает дату, минуты или считает секундомером и передает время в задачу.
                      </p>
                    </div>

                    {/* 3. Нод условия (1 вход, 2 выхода) */}
                    <div
                      draggable
                      onDragStart={(e) => onDragStart(e, 'conditionNode')}
                      className="p-3 rounded-xl bg-[#1c202c] border border-amber-500/50 hover:border-amber-400 cursor-grab active:cursor-grabbing transition shadow"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                        <GitBranch className="w-4 h-4" />
                        Нод условия (1 вх / 2 вых)
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Проверяет условие и направляет поток в выход TRUE или FALSE.
                      </p>
                    </div>

                    {/* 4. Погодный нод */}
                    <div
                      draggable
                      onDragStart={(e) => onDragStart(e, 'weatherNode')}
                      className="p-3 rounded-xl bg-[#1c202c] border border-purple-500/50 hover:border-purple-400 cursor-grab active:cursor-grabbing transition shadow"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                        <CloudSun className="w-4 h-4" />
                        Погодный нод (TRUE / FALSE)
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Регион, температура и погода. Из него выходят 2 порта: TRUE и FALSE.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#0e1015] border border-slate-800 text-[11px] text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-200">Как работает граф:</div>
                  <p>
                    1. Вытяните блоки на сетку и соедините их слева направо.
                  </p>
                  <p>
                    2. Нажмите «Тик графа» сверху — сигнал пройдет слева направо через условия и
                    запишет время в подключенные задачи.
                  </p>
                  <p>3. Удалить выбранный нод или связь: клавиша Delete / Backspace.</p>
                </div>
              </aside>
            </div>
          </div>
        ) : (
          /* ВКЛАДКА ОРГАНАЙЗЕРА: Все записи, фильтр по статусам, даты и суммарное время по задаче */
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-white">
                  Сводка задач и записей времени в органайзере
                </h1>
                <p className="text-xs text-slate-400">
                  Просмотр задач «в работе» и «выполненных», редактирование, удаление и детализация по датам
                </p>
              </div>

              {/* Быстрое добавление задачи / времени */}
              <form
                onSubmit={handleCreateTaskManual}
                className="flex flex-wrap items-center gap-2 bg-[#151821] p-2.5 rounded-xl border border-slate-800"
              >
                <input
                  type="text"
                  placeholder="Название задачи..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="bg-[#0e1015] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                />
                <input
                  type="date"
                  value={newTaskDate}
                  onChange={(e) => setNewTaskDate(e.target.value)}
                  className="bg-[#0e1015] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
                <input
                  type="number"
                  min={1}
                  value={newTaskMinutes}
                  onChange={(e) => setNewTaskMinutes(Number(e.target.value) || 0)}
                  className="w-20 bg-[#0e1015] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  title="Затраченное время (мин)"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                >
                  + Добавить задачу
                </button>
              </form>
            </div>

            {/* Два списка: Задачи В РАБОТЕ и ВЫПОЛНЕННЫЕ задачи с суммарным временем */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Список задач В РАБОТЕ */}
              <div className="bg-[#151821] border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                    <CircleDot className="w-4 h-4" />
                    Задачи в работе ({tasksInProgress.length})
                  </span>
                  <span className="text-xs text-slate-400">
                    Всего:{' '}
                    {tasksInProgress.reduce((acc, t) => acc + Number(t.total_minutes || 0), 0)} мин
                  </span>
                </div>

                {tasksInProgress.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">Нет задач в работе</p>
                ) : (
                  <div className="space-y-2">
                    {tasksInProgress.map((t) => (
                      <div
                        key={t.id}
                        className="p-3 rounded-xl bg-[#0e1015] border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          {editingTaskId === t.id ? (
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                value={editingTaskTitle}
                                onChange={(e) => setEditingTaskTitle(e.target.value)}
                                className="bg-[#151821] border border-indigo-500 rounded px-2 py-1 text-xs text-white w-full"
                              />
                              <button
                                onClick={() => handleSaveTaskTitle(t.id)}
                                className="px-2 py-1 bg-emerald-600 rounded text-xs"
                              >
                                ОК
                              </button>
                            </div>
                          ) : (
                            <div
                              onClick={() => openTaskDetails(t.id)}
                              className="font-semibold text-sm text-white hover:text-indigo-300 cursor-pointer truncate"
                            >
                              {t.title}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Суммарное время: <b className="text-indigo-300">{t.total_minutes} мин</b>{' '}
                            • Записей: {t.entries_count}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openTaskDetails(t.id)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200"
                          >
                            Даты
                          </button>
                          <button
                            onClick={() => {
                              setEditingTaskId(t.id);
                              setEditingTaskTitle(t.title);
                            }}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                            title="Редактировать"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleTaskStatus(t)}
                            className="px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 text-[11px]"
                            title="Пометить выполненной"
                          >
                            Завершить
                          </button>
                          <button
                            onClick={() => handleDeleteTask(t.id)}
                            className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/30 text-rose-400"
                            title="Удалить задачу"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Список ВЫПОЛНЕННЫХ задач */}
              <div className="bg-[#151821] border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Выполненные задачи ({tasksCompleted.length})
                  </span>
                  <span className="text-xs text-slate-400">
                    Всего:{' '}
                    {tasksCompleted.reduce((acc, t) => acc + Number(t.total_minutes || 0), 0)} мин
                  </span>
                </div>

                {tasksCompleted.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    Нет выполненных задач
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tasksCompleted.map((t) => (
                      <div
                        key={t.id}
                        className="p-3 rounded-xl bg-[#0e1015] border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div
                            onClick={() => openTaskDetails(t.id)}
                            className="font-semibold text-sm text-emerald-200 hover:underline cursor-pointer truncate"
                          >
                            {t.title}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Суммарное время:{' '}
                            <b className="text-emerald-300">{t.total_minutes} мин</b> • Записей:{' '}
                            {t.entries_count}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openTaskDetails(t.id)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200"
                          >
                            Даты
                          </button>
                          <button
                            onClick={() => handleToggleTaskStatus(t)}
                            className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 text-[11px]"
                          >
                            Вернуть в работу
                          </button>
                          <button
                            onClick={() => handleDeleteTask(t.id)}
                            className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/30 text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Детализация по выбранной задаче: все даты выполнения и суммарное время */}
            {selectedTaskDetail && (
              <div className="bg-[#151821] border-2 border-indigo-500/60 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-white">
                      Детализация задачи: «{selectedTaskDetail.title}»
                    </h2>
                    <p className="text-xs text-slate-400">
                      Статус:{' '}
                      {selectedTaskDetail.status === 'completed' ? 'Выполненная' : 'В работе'} •
                      Суммарное затраченное время:{' '}
                      <b className="text-indigo-300">{selectedTaskDetail.total_minutes} мин</b>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={newTaskDate}
                      onChange={(e) => setNewTaskDate(e.target.value)}
                      className="bg-[#0e1015] border border-slate-700 rounded px-2 py-1 text-xs"
                    />
                    <input
                      type="number"
                      min={1}
                      value={newTaskMinutes}
                      onChange={(e) => setNewTaskMinutes(Number(e.target.value) || 1)}
                      className="w-20 bg-[#0e1015] border border-slate-700 rounded px-2 py-1 text-xs"
                    />
                    <button
                      onClick={handleAddEntryToSelectedTask}
                      className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                    >
                      + Записать время к задаче
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {selectedTaskDetail.entries.length === 0 ? (
                    <div className="text-xs text-slate-500 col-span-3">
                      Записей времени по этой задаче пока нет.
                    </div>
                  ) : (
                    selectedTaskDetail.entries.map((en) => (
                      <div
                        key={en.id}
                        className="p-3 rounded-xl bg-[#0e1015] border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <span className="flex items-center gap-1.5 text-slate-300">
                          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                          {en.entry_date}
                        </span>
                        <span className="font-bold text-emerald-400">
                          +{en.duration_minutes} мин
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Общий журнал ВСЕХ записей в органайзере */}
            <div className="bg-[#151821] border border-slate-800 rounded-2xl p-4 space-y-3">
              <h2 className="text-sm font-bold text-slate-200">
                Все записи в органайзере ({allEntries.length})
              </h2>
              {allEntries.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">Записей пока нет</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2 px-3">Дата выполнения</th>
                        <th className="py-2 px-3">Задача</th>
                        <th className="py-2 px-3">Статус задачи</th>
                        <th className="py-2 px-3">Затраченное время</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allEntries.map((item) => (
                        <tr key={item.id} className="border-b border-slate-800/60">
                          <td className="py-2 px-3 font-mono text-slate-300">{item.entry_date}</td>
                          <td className="py-2 px-3 font-medium text-white">{item.task_title}</td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                item.task_status === 'completed'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-indigo-500/20 text-indigo-300'
                              }`}
                            >
                              {item.task_status === 'completed' ? 'Выполненная' : 'В работе'}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-bold text-emerald-400">
                            {item.duration_minutes} мин
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ReactFlowProvider>
  );
}
