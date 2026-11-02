import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  SelectionMode,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Connection,
  Edge,
  Node,
  Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Plus,
  Trash2,
  Play,
  Pause,
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
  Zap,
  MousePointerSquareDashed,
  Hand,
  Sparkles,
  X,
} from 'lucide-react';
import { TaskNode, TimeNode, ConditionNode, WeatherNode, NodeCallbacks } from './CustomNodes';
import { SCENARIO_PRESETS, ScenarioPreset } from './scenarioPresets';

interface User {
  id: string;
  login: string;
}

interface ScenarioRuntimeState {
  isRunning: boolean;
  intervalSeconds: number;
  remainingSeconds: number;
}

interface ScenarioItem {
  id: string;
  title: string;
  updated_at: string;
  graph_data?: {
    nodes: Node[];
    edges: Edge[];
    viewport?: Viewport;
    isRunning?: boolean;
    intervalSeconds?: number;
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

function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function OrganizerWorkspace({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const { screenToFlowPosition, setViewport, getViewport } = useReactFlow();

  // Сценарии и граф
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [scenarioTitle, setScenarioTitle] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const isLoadedRef = useRef(false);
  const saveTimerRef = useRef<any>(null);

  // Режим выделения нодов группами (рамкой или перемещение камеры)
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>('select');

  // Модальное окно выбора пустого или заготовленного сценария
  const [isNewScenarioModalOpen, setIsNewScenarioModalOpen] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('morning_sport_weather');
  const [customScenarioTitle, setCustomScenarioTitle] = useState<string>('');

  // Состояние таймеров сценариев
  const [scenarioTimers, setScenarioTimers] = useState<Record<string, ScenarioRuntimeState>>({});
  const [tickLog, setTickLog] = useState<string>('Готов к запуску сценария');

  // Вкладки
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

  // Поля создания / редактирования задач
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newTaskMinutes, setNewTaskMinutes] = useState(30);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');

  // Загрузка задач и записей
  const fetchOrganizerData = useCallback(async () => {
    const [tasksRes, entriesRes] = await Promise.all([
      fetch('/api/tasks', { credentials: 'include' }),
      fetch('/api/time-entries', { credentials: 'include' }),
    ]);
    if (tasksRes.ok) {
      const tData = await tasksRes.json();
      setTasks(tData.tasks || []);
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

  const onUpdateNodeData = useCallback(
    (nodeId: string, patch: Record<string, any>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n))
      );
      setSaveStatus('unsaved');
    },
    [setNodes]
  );

  const onLogTimeFromNode = useCallback(
    async (
      nodeId: string,
      durationMinutes: number,
      entryDate: string,
      title?: string,
      status?: 'in_progress' | 'completed',
      explicitScenarioId?: string
    ) => {
      const targetScenarioId = explicitScenarioId || activeScenarioId;
      if (!targetScenarioId) return;
      const res = await fetch('/api/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          scenario_id: targetScenarioId,
          node_id: nodeId,
          task_title: title,
          task_status: status,
          entry_date: entryDate,
          duration_minutes: durationMinutes,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (targetScenarioId === activeScenarioId) {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, totalMinutes: data.total_minutes } } : n
            )
          );
        }
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

  const nodesWithCallbacks = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: { ...n.data, callbacks },
      })),
    [nodes, callbacks]
  );

  // Количество выделенных сейчас нодов
  const selectedNodesCount = useMemo(
    () => nodes.filter((n) => n.selected).length,
    [nodes]
  );

  const handleSelectAllNodes = () => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
  };

  const handleDeleteSelectedNodes = () => {
    const selectedIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    if (selectedIds.size === 0) return;
    setNodes((nds) => nds.filter((n) => !selectedIds.has(n.id)));
    setEdges((eds) =>
      eds.filter((e) => !selectedIds.has(e.source) && !selectedIds.has(e.target))
    );
    setSaveStatus('unsaved');
  };

  const loadScenario = useCallback(
    async (id: string) => {
      isLoadedRef.current = false;
      const res = await fetch(`/api/scenarios/${id}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const sc: ScenarioItem = data.scenario;
      setActiveScenarioId(sc.id);
      setScenarioTitle(sc.title);

      const g = sc.graph_data || { nodes: [], edges: [] };
      const loadedNodes = Array.isArray(g.nodes) ? g.nodes : [];
      const loadedEdges = Array.isArray(g.edges) ? g.edges : [];
      setNodes(loadedNodes);
      setEdges(loadedEdges);

      if (g.viewport && typeof g.viewport.x === 'number') {
        setViewport(g.viewport, { duration: 150 });
      } else {
        setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 150 });
      }

      setScenarioTimers((prev) => {
        if (prev[sc.id]) return prev;
        const intervalSec = Number(g.intervalSeconds) || 15;
        return {
          ...prev,
          [sc.id]: {
            isRunning: Boolean(g.isRunning),
            intervalSeconds: intervalSec,
            remainingSeconds: intervalSec,
          },
        };
      });

      setSaveStatus('saved');
      setTimeout(() => {
        isLoadedRef.current = true;
        fetchOrganizerData();
      }, 150);
    },
    [fetchOrganizerData, setEdges, setNodes, setViewport]
  );

  useEffect(() => {
    fetch('/api/scenarios', { credentials: 'include' })
      .then((r) => r.json())
      .then(async (data) => {
        const list: ScenarioItem[] = data.scenarios || [];
        setScenarios(list);

        const initialTimers: Record<string, ScenarioRuntimeState> = {};
        for (const item of list) {
          initialTimers[item.id] = {
            isRunning: false,
            intervalSeconds: 15,
            remainingSeconds: 15,
          };
        }
        setScenarioTimers(initialTimers);

        if (list.length > 0) {
          loadScenario(list[0].id);
        }
      });
    fetchOrganizerData();
  }, [fetchOrganizerData, loadScenario]);

  const triggerSave = useCallback(() => {
    setSaveStatus('unsaved');
  }, []);

  useEffect(() => {
    if (!activeScenarioId || !isLoadedRef.current) return;
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
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

      const timerState = scenarioTimers[activeScenarioId];
      const currentViewport = getViewport();

      const graphPayload = {
        title: scenarioTitle,
        graph_data: {
          nodes: serializedNodes,
          edges,
          viewport: currentViewport,
          isRunning: timerState?.isRunning || false,
          intervalSeconds: timerState?.intervalSeconds || 15,
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
    }, 450);

    return () => clearTimeout(saveTimerRef.current);
  }, [
    nodes,
    edges,
    scenarioTitle,
    activeScenarioId,
    scenarioTimers,
    getViewport,
    fetchOrganizerData,
  ]);

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

      const flowPos = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const position = {
        x: Math.round(flowPos.x - 115),
        y: Math.round(flowPos.y - 45),
      };

      const today = new Date().toISOString().slice(0, 10);
      const newId = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

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
    [screenToFlowPosition, setNodes]
  );

  // Движок прохода тика слева направо
  const runGraphTickLeftToRight = useCallback(async () => {
    if (nodes.length === 0) {
      setTickLog('На канвасе пока нет нодов для тика');
      return;
    }

    const sorted = [...nodes].sort((a, b) => a.position.x - b.position.x);
    const incomingCount = new Map<string, number>();
    nodes.forEach((n) => incomingCount.set(n.id, 0));
    edges.forEach((e) => incomingCount.set(e.target, (incomingCount.get(e.target) || 0) + 1));

    const activeNodeIds = new Set<string>();
    const carriedPayload = new Map<string, { minutes: number; date: string }>();
    const today = new Date().toISOString().slice(0, 10);

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
      `Событие выполнено слева направо: активно нодов ${activeNodeIds.size}, задач записано: ${loggedTasksCount}`
    );
  }, [nodes, edges, onLogTimeFromNode, setNodes]);

  const runTickRef = useRef(runGraphTickLeftToRight);
  useEffect(() => {
    runTickRef.current = runGraphTickLeftToRight;
  }, [runGraphTickLeftToRight]);

  useEffect(() => {
    const timer = setInterval(() => {
      setScenarioTimers((prev) => {
        let changed = false;
        const next: Record<string, ScenarioRuntimeState> = { ...prev };

        for (const [scId, st] of Object.entries(prev)) {
          if (!st.isRunning) continue;
          changed = true;
          if (st.remainingSeconds <= 1) {
            if (scId === activeScenarioId) {
              runTickRef.current();
            }
            next[scId] = {
              ...st,
              remainingSeconds: st.intervalSeconds,
            };
          } else {
            next[scId] = {
              ...st,
              remainingSeconds: st.remainingSeconds - 1,
            };
          }
        }

        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeScenarioId]);

  const toggleScenarioRunning = (scId: string) => {
    setScenarioTimers((prev) => {
      const current = prev[scId] || {
        isRunning: false,
        intervalSeconds: 15,
        remainingSeconds: 15,
      };
      const nextRunning = !current.isRunning;
      return {
        ...prev,
        [scId]: {
          ...current,
          isRunning: nextRunning,
          remainingSeconds: nextRunning ? current.intervalSeconds : current.remainingSeconds,
        },
      };
    });
    setSaveStatus('unsaved');
  };

  const updateActiveScenarioInterval = (seconds: number) => {
    if (!activeScenarioId) return;
    const clamped = Math.max(3, Math.min(3600, seconds));
    setScenarioTimers((prev) => {
      const current = prev[activeScenarioId] || {
        isRunning: false,
        intervalSeconds: clamped,
        remainingSeconds: clamped,
      };
      return {
        ...prev,
        [activeScenarioId]: {
          ...current,
          intervalSeconds: clamped,
          remainingSeconds: clamped,
        },
      };
    });
    setSaveStatus('unsaved');
  };

  // Открытие модального окна создания нового сценария
  const openCreateScenarioModal = () => {
    const defaultPreset = SCENARIO_PRESETS[1] || SCENARIO_PRESETS[0];
    setSelectedPresetId(defaultPreset.id);
    setCustomScenarioTitle(defaultPreset.title);
    setIsNewScenarioModalOpen(true);
  };

  // Подтверждение создания сценария (пустого или по жизненному шаблону)
  const handleConfirmCreateScenario = async (e: React.FormEvent) => {
    e.preventDefault();
    const preset: ScenarioPreset =
      SCENARIO_PRESETS.find((p) => p.id === selectedPresetId) || SCENARIO_PRESETS[0];
    const today = new Date().toISOString().slice(0, 10);
    const built = preset.buildGraph(today);

    // Делаем уникальные ID нодов, чтобы разные сценарии не конфликтовали
    const suffix = Date.now().toString().slice(-5);
    const idMap = new Map<string, string>();
    const uniqueNodes = built.nodes.map((n) => {
      const newNodeId = `${n.id}_${suffix}`;
      idMap.set(n.id, newNodeId);
      return { ...n, id: newNodeId };
    });
    const uniqueEdges = built.edges.map((ed) => ({
      ...ed,
      id: `${ed.id}_${suffix}`,
      source: idMap.get(ed.source) || ed.source,
      target: idMap.get(ed.target) || ed.target,
    }));

    const titleToUse =
      customScenarioTitle.trim() ||
      (preset.id === 'empty' ? `Сценарий #${scenarios.length + 1}` : preset.title);

    const res = await fetch('/api/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title: titleToUse,
        graph_data: {
          nodes: uniqueNodes,
          edges: uniqueEdges,
          viewport: built.viewport,
          isRunning: false,
          intervalSeconds: built.intervalSeconds,
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const created: ScenarioItem = data.scenario;
      setScenarios((prev) => [created, ...prev]);
      setScenarioTimers((prev) => ({
        ...prev,
        [created.id]: {
          isRunning: false,
          intervalSeconds: built.intervalSeconds,
          remainingSeconds: built.intervalSeconds,
        },
      }));
      setIsNewScenarioModalOpen(false);
      await loadScenario(created.id);
      setActiveTab('canvas');
    }
  };

  const handleDeleteScenario = async (id: string) => {
    if (scenarios.length <= 1) return;
    await fetch(`/api/scenarios/${id}`, { method: 'DELETE', credentials: 'include' });
    const next = scenarios.filter((s) => s.id !== id);
    setScenarios(next);
    if (activeScenarioId === id && next[0]) {
      loadScenario(next[0].id);
    }
  };

  const openTaskDetails = async (taskId: string) => {
    const res = await fetch(`/api/tasks/${taskId}`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setSelectedTaskDetail(data.task);
    }
  };

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

  const handleDeleteTask = async (taskId: string) => {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE', credentials: 'include' });
    if (selectedTaskDetail?.id === taskId) setSelectedTaskDetail(null);
    fetchOrganizerData();
  };

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

  const tasksInProgress = tasks.filter((t) => t.status === 'in_progress');
  const tasksCompleted = tasks.filter((t) => t.status === 'completed');
  const activeTimer = activeScenarioId ? scenarioTimers[activeScenarioId] : undefined;

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#0e1015] text-slate-100">
      {/* ЛЕВОЕ МЕНЮ */}
      <aside className="w-72 bg-[#151821] border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <div className="font-bold text-sm tracking-wide text-white flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-indigo-400" />
              Органайзер времени
            </div>
          </div>

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

          {/* Кнопка открытия меню выбора пустого или заготовленного сценария */}
          <button
            type="button"
            onClick={openCreateScenarioModal}
            className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            Новый сценарий (шаблоны)
          </button>

          {/* Список сценариев с индикатором состояния и обратным отсчетом */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1">
              Мои сценарии
            </div>
            {scenarios.map((sc) => {
              const tState = scenarioTimers[sc.id] || {
                isRunning: false,
                intervalSeconds: 15,
                remainingSeconds: 15,
              };
              const isSelected = activeScenarioId === sc.id;

              return (
                <div
                  key={sc.id}
                  onClick={() => {
                    loadScenario(sc.id);
                    setActiveTab('canvas');
                  }}
                  className={`group p-2.5 rounded-xl text-xs cursor-pointer transition border ${
                    isSelected
                      ? 'bg-indigo-600/15 border-indigo-500/60 text-white'
                      : 'bg-[#10131b] border-slate-800/80 text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          tState.isRunning
                            ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]'
                            : 'bg-slate-600'
                        }`}
                        title={tState.isRunning ? 'Сценарий запущен' : 'Сценарий остановлен'}
                      />
                      <span className="truncate font-semibold">{sc.title}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleScenarioRunning(sc.id);
                        }}
                        className={`p-1 rounded transition ${
                          tState.isRunning
                            ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                        title={
                          tState.isRunning ? 'Остановить сценарий' : 'Запустить таймер сценария'
                        }
                      >
                        {tState.isRunning ? (
                          <Pause className="w-3 h-3" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                      </button>

                      {scenarios.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteScenario(sc.id);
                          }}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 transition"
                          title="Удалить сценарий"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[11px] pl-4">
                    <span
                      className={
                        tState.isRunning ? 'text-emerald-400 font-medium' : 'text-slate-500'
                      }
                    >
                      {tState.isRunning ? 'Запущен' : 'Остановлен'}
                    </span>

                    {tState.isRunning ? (
                      <span className="font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-700/50 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        След. событие: {formatCountdown(tState.remainingSeconds)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500">
                        Цикл: {tState.intervalSeconds}с
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

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
              onClick={onLogout}
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
          {/* Верхний тулбар */}
          <header className="h-14 bg-[#151821] border-b border-slate-800 px-4 flex items-center justify-between gap-3 z-10">
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

              {/* Переключатель режима: Выделение рамкой и перемещение групп / Перемещение камеры */}
              <div className="flex items-center bg-[#0e1015] p-1 rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => setInteractionMode('select')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
                    interactionMode === 'select'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Тяните мышкой по сетке, чтобы выделить сразу группу нодов и двигать их вместе"
                >
                  <MousePointerSquareDashed className="w-3.5 h-3.5" />
                  Рамка (группы)
                </button>
                <button
                  type="button"
                  onClick={() => setInteractionMode('pan')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
                    interactionMode === 'pan'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Перемещение камеры левой кнопкой мыши (выделение рамкой через Shift)"
                >
                  <Hand className="w-3.5 h-3.5" />
                  Камера
                </button>
              </div>

              {selectedNodesCount > 0 && (
                <div className="flex items-center gap-1.5 bg-sky-500/15 border border-sky-500/40 px-2.5 py-1 rounded-lg text-xs text-sky-200">
                  <span>Выделено: {selectedNodesCount}</span>
                  <button
                    type="button"
                    onClick={handleDeleteSelectedNodes}
                    className="ml-1 text-rose-300 hover:text-rose-200 underline"
                  >
                    Удалить группу
                  </button>
                </div>
              )}

              <span className="text-xs text-slate-400 hidden 2xl:inline">{tickLog}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAllNodes}
                className="px-2.5 py-1.5 rounded-lg bg-[#0e1015] border border-slate-700 hover:border-slate-500 text-slate-300 text-xs"
                title="Выделить все ноды на холсте для группового перемещения"
              >
                Выделить все
              </button>

              {activeScenarioId && activeTimer && (
                <div className="flex items-center gap-1.5 bg-[#0e1015] border border-slate-700 rounded-lg px-2.5 py-1 text-xs">
                  <span className="text-slate-400">Период (с):</span>
                  <input
                    type="number"
                    min={3}
                    max={3600}
                    value={activeTimer.intervalSeconds}
                    onChange={(e) => updateActiveScenarioInterval(Number(e.target.value) || 15)}
                    className="w-12 bg-transparent text-white font-mono font-semibold text-center focus:outline-none"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={runGraphTickLeftToRight}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Zap className="w-3.5 h-3.5" />
                Разовый тик
              </button>

              {activeScenarioId && activeTimer && (
                <button
                  type="button"
                  onClick={() => toggleScenarioRunning(activeScenarioId)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${
                    activeTimer.isRunning
                      ? 'bg-emerald-600/20 border-emerald-400 text-emerald-200'
                      : 'bg-[#0e1015] border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {activeTimer.isRunning ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      Запущен ({formatCountdown(activeTimer.remainingSeconds)})
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      Запустить сценарий
                    </>
                  )}
                </button>
              )}
            </div>
          </header>

          {/* Канвас с поддержкой выделения групп и правая палитра */}
          <div className="flex-1 flex relative">
            <div className="flex-1 h-full" onDrop={onDrop} onDragOver={onDragOver}>
              <ReactFlow
                nodes={nodesWithCallbacks}
                edges={edges}
                onNodesChange={(changes) => {
                  onNodesChange(changes);
                  triggerSave();
                }}
                onEdgesChange={(changes) => {
                  onEdgesChange(changes);
                  triggerSave();
                }}
                onMoveEnd={() => triggerSave()}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                selectionOnDrag={interactionMode === 'select'}
                panOnDrag={interactionMode === 'pan' ? true : [1, 2]}
                selectionMode={SelectionMode.Partial}
                multiSelectionKeyCode={['Shift', 'Control', 'Meta']}
                selectionKeyCode="Shift"
                deleteKeyCode={['Backspace', 'Delete']}
                className="bg-[#0f1219]"
              >
                <Background variant={BackgroundVariant.Lines} gap={28} size={1} color="#1e2433" />
                <Controls className="!bg-[#151821] !border-slate-700 !text-white" />
                <MiniMap
                  nodeColor="#4f46e5"
                  maskColor="rgba(15, 18, 25, 0.75)"
                  className="!bg-[#151821] !border !border-slate-700"
                />
              </ReactFlow>
            </div>

            {/* ПРАВАЯ ПАЛИТРА ЭЛЕМЕНТОВ */}
            <aside className="w-72 bg-[#151821] border-l border-slate-800 p-4 flex flex-col justify-between shrink-0 overflow-y-auto">
              <div className="space-y-4">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Палитра нодов
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Перетащите блок в любое место сетки канваса
                  </p>
                </div>

                <div className="space-y-2.5">
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

              <div className="p-3 rounded-xl bg-[#0e1015] border border-slate-800 text-[11px] text-slate-400 space-y-1.5">
                <div className="font-semibold text-slate-200">Групповое управление:</div>
                <p>
                  • В режиме <b>«Рамка (группы)»</b> зажмите левую кнопку мыши на пустом месте и
                  обведите несколько нодов — теперь их можно перетаскивать все вместе за любой из
                  выделенных нодов.
                </p>
                <p>
                  • Также можно кликать по нодам с зажатым <b>Shift</b> или <b>Ctrl</b>.
                </p>
                <p>
                  • Перемещать камеру в режиме рамки можно колесиком / средней или правой кнопкой
                  мыши (либо переключив тумблер в <b>«Камера»</b>).
                </p>
              </div>
            </aside>
          </div>
        </div>
      ) : (
        /* ВКЛАДКА ОРГАНАЙЗЕРА */
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-white">
                Сводка задач и записей времени в органайзере
              </h1>
              <p className="text-xs text-slate-400">
                Просмотр задач «в работе» и «выполненных», редактирование, удаление и детализация по
                датам
              </p>
            </div>

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
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                + Добавить задачу
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleTaskStatus(t)}
                          className="px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 text-[11px]"
                        >
                          Завершить
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
                <p className="text-xs text-slate-500 py-4 text-center">Нет выполненных задач</p>
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
                          Суммарное время: <b className="text-emerald-300">{t.total_minutes} мин</b>{' '}
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

      {/* МОДАЛЬНОЕ МЕНЮ ВЫБОРА ПУСТОГО ИЛИ ЗАГОТОВЛЕННОГО СЦЕНАРИЯ */}
      {isNewScenarioModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#161923] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold text-white">
                  Создание сценария: выберите пустой холст или жизненный шаблон
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsNewScenarioModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCreateScenario} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Название нового сценария
                </label>
                <input
                  type="text"
                  value={customScenarioTitle}
                  onChange={(e) => setCustomScenarioTitle(e.target.value)}
                  placeholder="Введите название сценария..."
                  className="w-full bg-[#0e1015] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                <div className="text-xs font-semibold text-slate-300">
                  Выберите вариант сценария:
                </div>

                {SCENARIO_PRESETS.map((preset) => {
                  const isActive = selectedPresetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => {
                        setSelectedPresetId(preset.id);
                        setCustomScenarioTitle(
                          preset.id === 'empty'
                            ? `Новый сценарий #${scenarios.length + 1}`
                            : preset.title
                        );
                      }}
                      className={`p-3.5 rounded-xl border cursor-pointer transition ${
                        isActive
                          ? 'bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-500/10'
                          : 'bg-[#0e1015] border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-white">{preset.title}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-indigo-300">
                          {preset.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {preset.description}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewScenarioModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30"
                >
                  Создать и открыть сценарий
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .finally(() => setAuthLoading(false));
  }, []);

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
                placeholder="Например: admin"
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

  return (
    <ReactFlowProvider>
      <OrganizerWorkspace user={user} onLogout={handleLogout} />
    </ReactFlowProvider>
  );
}
