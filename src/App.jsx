import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Users,
  Save,
  Settings,
  Filter,
  Download,
  Printer,
} from 'lucide-react';

// --- Firebase Configuration & Initialization ---
const firebaseConfig = {
  apiKey: 'AIzaSyBEiI-Vi30LpEg084T31WfPS7bcNaKOp6Q',
  authDomain: 'jsjh-schedule-app.firebaseapp.com',
  projectId: 'jsjh-schedule-app',
  storageBucket: 'jsjh-schedule-app.firebasestorage.app',
  messagingSenderId: '602787453872',
  appId: '1:602787453872:web:ac4086018765dca41d9475',
};

// Initialize Firebase services safely
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Constants & Data ---
const DEPARTMENTS = [
  {
    name: '教務處',
    color:
      'bg-blue-100 text-blue-800 border-blue-200 print:bg-blue-100 print:text-blue-900 print:border-blue-300',
    sections: ['教學組', '註冊組', '設備組', '資訊組'],
  },
  {
    name: '學務處',
    color:
      'bg-green-100 text-green-800 border-green-200 print:bg-green-100 print:text-green-900 print:border-green-300',
    sections: ['訓育組', '生教組', '衛生組', '體育組'],
  },
  {
    name: '總務處',
    color:
      'bg-orange-100 text-orange-800 border-orange-200 print:bg-orange-100 print:text-orange-900 print:border-orange-300',
    sections: ['文書組', '事務組', '出納組'],
  },
  {
    name: '輔導室',
    color:
      'bg-purple-100 text-purple-800 border-purple-200 print:bg-purple-100 print:text-purple-900 print:border-purple-300',
    sections: ['輔導組', '資料組', '特教組'],
  },
  {
    name: '人事室',
    color:
      'bg-gray-100 text-gray-800 border-gray-200 print:bg-gray-100 print:text-gray-900 print:border-gray-300',
    sections: ['人事室'],
  },
  {
    name: '主計室',
    color:
      'bg-gray-100 text-gray-800 border-gray-200 print:bg-gray-100 print:text-gray-900 print:border-gray-300',
    sections: ['主計室'],
  },
  {
    name: '校長室',
    color:
      'bg-red-100 text-red-800 border-red-200 print:bg-red-100 print:text-red-900 print:border-red-300',
    sections: ['校長'],
  },
];

const WEEKS_ZH = ['日', '一', '二', '三', '四', '五', '六'];

// --- Helper Functions ---
const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDatesInRange = (startDate, endDate) => {
  if (!startDate || !endDate) return [];
  const dates = [];
  let currentDate = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(currentDate.getTime()) || isNaN(end.getTime())) return [];

  while (currentDate <= end) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
};

// --- Components ---

// Modal Component
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 print:hidden">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          {/* Ensure title is rendered as string */}
          <h3 className="text-lg font-semibold text-gray-800">
            {String(title || '')}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <span className="text-2xl">&times;</span>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

export default function SchoolCalendarApp() {
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [config, setConfig] = useState({
    startDate: formatDate(new Date()),
    endDate: formatDate(
      new Date(new Date().setMonth(new Date().getMonth() + 6))
    ),
    semesterName: '113學年度第二學期',
  });

  // Local UI State
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0]);
  const [selectedSection, setSelectedSection] = useState(
    DEPARTMENTS[0].sections[0]
  );
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingDate, setEditingDate] = useState(null);
  const [newEventContent, setNewEventContent] = useState('');
  const [filterDept, setFilterDept] = useState('ALL');

  // --- Firebase Auth & Data Sync ---
  useEffect(() => {
    // Check if auth exists to prevent ReferenceError
    if (!auth) {
      console.error('Firebase Auth not initialized correctly.');
      return;
    }

    const initAuth = async () => {
      try {
        if (
          typeof __initial_auth_token !== 'undefined' &&
          __initial_auth_token
        ) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error('Auth initialization failed:', err);
      }
    };

    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    // Sync Events
    try {
      const eventsRef = collection(
        db,
        'artifacts',
        appId,
        'public',
        'data',
        'calendar_events'
      );
      const qEvents = query(eventsRef);

      const unsubEvents = onSnapshot(
        qEvents,
        (snapshot) => {
          const loadedEvents = snapshot.docs.map((doc) => {
            const data = doc.data();
            // Safety: Ensure content is treated as string to avoid rendering errors
            return {
              id: doc.id,
              ...data,
              content: String(data.content || ''),
              department: String(data.department || ''),
              section: String(data.section || ''),
            };
          });
          setEvents(loadedEvents);
        },
        (error) => console.error('Error fetching events:', error)
      );

      // Sync Config
      const configRef = collection(
        db,
        'artifacts',
        appId,
        'public',
        'data',
        'calendar_config'
      );
      const unsubConfig = onSnapshot(
        configRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const serverConfig = snapshot.docs.find(
              (d) => d.id === 'main_config'
            );
            if (serverConfig) {
              const data = serverConfig.data();
              setConfig({
                startDate: String(data.startDate || config.startDate),
                endDate: String(data.endDate || config.endDate),
                semesterName: String(data.semesterName || config.semesterName),
              });
            }
          }
        },
        (error) => console.error('Error fetching config:', error)
      );

      return () => {
        unsubEvents();
        unsubConfig();
      };
    } catch (e) {
      console.error('Firestore sync error:', e);
    }
  }, [user]);

  // --- Logic ---

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!user) return;
    try {
      await setDoc(
        doc(
          db,
          'artifacts',
          appId,
          'public',
          'data',
          'calendar_config',
          'main_config'
        ),
        config
      );
      setShowConfigModal(false);
    } catch (err) {
      console.error('Save config failed', err);
    }
  };

  const handleAddEvent = async () => {
    if (!newEventContent.trim() || !user) return;

    const newEvent = {
      date: editingDate,
      content: String(newEventContent), // Ensure string
      department: selectedDept.name,
      section: selectedSection,
      timestamp: Date.now(),
      authorId: user.uid,
    };

    try {
      const docId = `${Date.now()}_${user.uid.slice(0, 5)}`;
      await setDoc(
        doc(db, 'artifacts', appId, 'public', 'data', 'calendar_events', docId),
        newEvent
      );
      setNewEventContent('');
      setShowEventModal(false);
    } catch (err) {
      console.error('Add event failed', err);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!confirm('確定要刪除這個行程嗎？')) return;
    try {
      await deleteDoc(
        doc(
          db,
          'artifacts',
          appId,
          'public',
          'data',
          'calendar_events',
          eventId
        )
      );
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Generate Calendar Days
  const calendarDays = useMemo(() => {
    if (!config.startDate || !config.endDate) return [];

    try {
      const start = new Date(config.startDate);
      const end = new Date(config.endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];

      const startDay = start.getDay();
      const displayStart = new Date(start);
      displayStart.setDate(start.getDate() - startDay);

      const endDay = end.getDay();
      const displayEnd = new Date(end);
      displayEnd.setDate(end.getDate() + (6 - endDay));

      const dates = getDatesInRange(
        formatDate(displayStart),
        formatDate(displayEnd)
      );

      return dates.map((date) => {
        const dateStr = formatDate(date);
        const dayEvents = events.filter((e) => e.date === dateStr);
        const inSemester =
          dateStr >= config.startDate && dateStr <= config.endDate;

        return {
          dateObj: date,
          dateStr,
          dayOfWeek: date.getDay(),
          events: dayEvents,
          inSemester,
        };
      });
    } catch (e) {
      console.error('Error generating calendar days:', e);
      return [];
    }
  }, [config.startDate, config.endDate, events]);

  // Group by Weeks
  const weeksData = useMemo(() => {
    const weeks = [];
    let currentWeek = [];

    calendarDays.forEach((day, index) => {
      currentWeek.push(day);
      if (day.dayOfWeek === 6 || index === calendarDays.length - 1) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });
    return weeks;
  }, [calendarDays]);

  const filteredWeeks = useMemo(() => {
    return weeksData;
  }, [weeksData]);

  // --- Render ---

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans print:bg-white">
      {/* Print-specific Styles */}
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 10mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background-color: white !important;
          }
          ::-webkit-scrollbar { display: none; }
        }
      `}</style>

      {/* Header - Hidden on Print */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center py-4 space-y-4 md:space-y-0">
            {/* Title & Config Trigger */}
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-600 rounded-lg shadow-lg">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 leading-tight">
                  學校行事曆協作平台
                </h1>
                <div
                  className="flex items-center space-x-2 text-sm text-gray-500 cursor-pointer hover:text-indigo-600 transition-colors"
                  onClick={() => setShowConfigModal(true)}
                >
                  {/* Safety check for rendering */}
                  <span>{String(config.semesterName)}</span>
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                    {String(config.startDate)} ~ {String(config.endDate)}
                  </span>
                  <Settings className="w-3 h-3" />
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-3">
              {/* User Identity Selector */}
              <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4 bg-gray-50 p-2 rounded-lg border border-gray-100">
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-600">
                    目前身分：
                  </span>
                </div>
                <div className="flex space-x-2">
                  <select
                    value={selectedDept?.name}
                    onChange={(e) => {
                      const dept = DEPARTMENTS.find(
                        (d) => d.name === e.target.value
                      );
                      if (dept) {
                        setSelectedDept(dept);
                        setSelectedSection(dept.sections[0]);
                      }
                    }}
                    className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-1"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value)}
                    className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-1"
                  >
                    {selectedDept?.sections.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Filter */}
              <div className="flex items-center space-x-2">
                <select
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                  className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-1"
                >
                  <option value="ALL">顯示所有處室</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Print Button */}
              <button
                onClick={handlePrint}
                className="flex items-center px-3 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors shadow-sm"
                title="列印行事曆"
              >
                <Printer className="w-4 h-4 mr-2" />
                <span className="text-sm">列印 / 存為PDF</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-0 print:max-w-none print:w-full">
        {/* Print Header */}
        <div className="hidden print:block text-center mb-6">
          <h1 className="text-2xl font-serif font-bold text-black">
            {String(config.semesterName)} 行事曆
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            期間：{String(config.startDate)} 至 {String(config.endDate)}
          </p>
        </div>

        {/* Weekly View */}
        <div className="space-y-8 print:space-y-4">
          {filteredWeeks.map((week, wIndex) => (
            <div
              key={wIndex}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:rounded-none print:border-black print:break-inside-avoid"
            >
              {/* Week Header */}
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center print:bg-gray-100 print:border-black print:py-1">
                <span className="font-bold text-gray-700 print:text-black">
                  第 {wIndex + 1} 週
                </span>
                <span className="text-xs text-gray-500 print:text-black">
                  {formatDate(week[0].dateObj)} -{' '}
                  {formatDate(week[week.length - 1].dateObj)}
                </span>
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-gray-100 print:divide-x print:divide-black print:border-collapse">
                {week.map((day) => {
                  const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
                  const displayEvents =
                    filterDept === 'ALL'
                      ? day.events
                      : day.events.filter((e) => e.department === filterDept);

                  return (
                    <div
                      key={day.dateStr}
                      className={`
                        min-h-[150px] group flex flex-col 
                        ${
                          isWeekend
                            ? 'bg-gray-50/50 print:bg-gray-50'
                            : 'bg-white'
                        }
                        ${!day.inSemester ? 'opacity-50 print:opacity-30' : ''}
                        print:min-h-[100px]
                      `}
                    >
                      {/* Day Header */}
                      <div className="p-2 border-b border-gray-50 flex justify-between items-center print:border-gray-300 print:py-1">
                        <div className="flex items-center space-x-1">
                          <span
                            className={`text-sm font-bold ${
                              isWeekend
                                ? 'text-red-500 print:text-black'
                                : 'text-gray-700 print:text-black'
                            }`}
                          >
                            {day.dateObj.getDate()}
                          </span>
                          <span className="text-xs text-gray-400 print:text-gray-600">
                            ({WEEKS_ZH[day.dayOfWeek]})
                          </span>
                        </div>
                        {/* Add Button */}
                        <button
                          onClick={() => {
                            setEditingDate(day.dateStr);
                            setShowEventModal(true);
                          }}
                          className="print:hidden opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-indigo-50 rounded text-indigo-600"
                          title="新增行程"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Events List */}
                      <div className="p-2 space-y-1.5 flex-1 print:p-1 print:space-y-1">
                        {displayEvents.map((event) => {
                          const deptConfig =
                            DEPARTMENTS.find(
                              (d) => d.name === event.department
                            ) || DEPARTMENTS[0];
                          return (
                            <div
                              key={event.id}
                              className={`
                                text-xs p-1.5 rounded border ${deptConfig.color} relative group/event
                                print:border print:text-[10pt] print:p-1 print:leading-tight
                              `}
                            >
                              <div className="font-bold mb-0.5 flex justify-between print:mb-0">
                                <span className="print:font-semibold">
                                  {String(event.department)}
                                </span>
                                <button
                                  onClick={() => handleDeleteEvent(event.id)}
                                  className="print:hidden hidden group-hover/event:block text-red-600 hover:text-red-800"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="whitespace-pre-wrap break-words">
                                <span className="text-gray-500 mr-1 print:text-gray-700">
                                  [{String(event.section)}]
                                </span>
                                {String(event.content)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {/* Fill empty cells */}
                {Array.from({ length: 7 - week.length }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="hidden md:block bg-gray-50/30 print:block print:bg-white"
                  ></div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {events.length === 0 && (
          <div className="text-center py-20 text-gray-400 print:hidden">
            <Calendar className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>目前沒有任何行程，開始新增吧！</p>
          </div>
        )}
      </main>

      {/* --- Modals --- */}

      {/* Settings Modal */}
      <Modal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        title="行事曆設定"
      >
        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              學期名稱
            </label>
            <input
              type="text"
              value={config.semesterName}
              onChange={(e) =>
                setConfig({ ...config, semesterName: e.target.value })
              }
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                開始日期
              </label>
              <input
                type="date"
                value={config.startDate}
                onChange={(e) =>
                  setConfig({ ...config, startDate: e.target.value })
                }
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                結束日期
              </label>
              <input
                type="date"
                value={config.endDate}
                onChange={(e) =>
                  setConfig({ ...config, endDate: e.target.value })
                }
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
            <p>
              注意：修改日期範圍可能會導致部分已存在的行程無法在日曆上顯示。
            </p>
          </div>
          <button
            type="submit"
            className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Save className="w-4 h-4 mr-2" />
            儲存設定
          </button>
        </form>
      </Modal>

      {/* Add Event Modal */}
      <Modal
        isOpen={showEventModal}
        onClose={() => setShowEventModal(false)}
        title="新增行事曆活動"
      >
        <div className="space-y-4">
          <div className="bg-gray-50 p-3 rounded border border-gray-200 text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">日期：</span>
              <span className="font-bold">{editingDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">編輯身分：</span>
              <span
                className={`font-bold px-2 py-0.5 rounded text-xs ${selectedDept?.color}`}
              >
                {selectedDept?.name} - {selectedSection}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              活動內容
            </label>
            <textarea
              rows={4}
              value={newEventContent}
              onChange={(e) => setNewEventContent(e.target.value)}
              placeholder="請輸入活動內容..."
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          <button
            onClick={handleAddEvent}
            className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Plus className="w-4 h-4 mr-2" />
            新增至行事曆
          </button>
        </div>
      </Modal>
    </div>
  );
}
