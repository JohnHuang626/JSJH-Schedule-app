import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc,
  onSnapshot, 
  query, 
  orderBy 
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
  List, // Added List icon
  Grid  // Added Grid icon
} from 'lucide-react';

// --- Firebase Configuration & Initialization ---
const fallbackConfig = {
  apiKey: "AIzaSyBEiI-Vi30LpEg084T31WfPS7bcNaKOp6Q",
  authDomain: "jsjh-schedule-app.firebaseapp.com",
  projectId: "jsjh-schedule-app",
  storageBucket: "jsjh-schedule-app.firebasestorage.app",
  messagingSenderId: "602787453872",
  appId: "1:602787453872:web:ac4086018765dca41d9475"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : fallbackConfig;

// Initialize Firebase services safely
let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (error) {
  console.error("Firebase initialization error:", error);
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Constants & Data ---
// 顏色調整：加深背景與文字顏色，增加對比度
const DEPARTMENTS = [
  { 
    name: '教務處', 
    color: 'bg-blue-200 text-blue-900 border-blue-300 print:bg-transparent print:text-black',
    sections: ['教學組', '註冊組', '設備組', '資訊組'] 
  },
  { 
    name: '學務處', 
    color: 'bg-green-200 text-green-900 border-green-300 print:bg-transparent print:text-black',
    sections: ['訓育組', '生教組', '衛生組', '體育組'] 
  },
  { 
    name: '總務處', 
    color: 'bg-orange-200 text-orange-900 border-orange-300 print:bg-transparent print:text-black',
    sections: ['文書組', '事務組', '出納組'] 
  },
  { 
    name: '輔導室', 
    color: 'bg-purple-200 text-purple-900 border-purple-300 print:bg-transparent print:text-black',
    sections: ['輔導組', '資料組', '特教組'] 
  },
  { 
    name: '人事室', 
    color: 'bg-gray-200 text-gray-900 border-gray-300 print:bg-transparent print:text-black',
    sections: ['人事室'] 
  },
  { 
    name: '主計室', 
    color: 'bg-gray-200 text-gray-900 border-gray-300 print:bg-transparent print:text-black',
    sections: ['主計室'] 
  },
  { 
    name: '校長室', 
    color: 'bg-red-200 text-red-900 border-red-300 print:bg-transparent print:text-black',
    sections: ['校長'] 
  }
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

const formatDateZH = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const weekDay = WEEKS_ZH[d.getDay()];
  return `${month}/${day}(${weekDay})`;
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

// Calculate week number relative to start date
const getWeekInfo = (dateStr, startDateStr) => {
  const d = new Date(dateStr);
  const start = new Date(startDateStr);
  // Adjust start to previous Sunday to align weeks
  const startDay = start.getDay();
  const adjustedStart = new Date(start);
  adjustedStart.setDate(start.getDate() - startDay);
  
  const diffTime = Math.abs(d - adjustedStart);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  // +1 because day 1 is in week 1
  return Math.floor(diffDays / 7) + 1;
};

// --- Components ---

// Modal Component
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 print:hidden">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-800">{String(title || '')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="text-2xl">&times;</span>
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default function SchoolCalendarApp() {
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [config, setConfig] = useState({
    startDate: formatDate(new Date()),
    endDate: formatDate(new Date(new Date().setMonth(new Date().getMonth() + 6))),
    semesterName: '113學年度第二學期'
  });
  
  // Local UI State
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0]);
  const [selectedSection, setSelectedSection] = useState(DEPARTMENTS[0].sections[0]);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingDate, setEditingDate] = useState(null);
  const [newEventContent, setNewEventContent] = useState("");
  const [filterDept, setFilterDept] = useState("ALL");
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'

  // --- Firebase Auth & Data Sync ---
  useEffect(() => {
    if (!auth) {
      console.error("Firebase Auth service not available");
      return;
    }

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenError) {
            console.warn("Custom token mismatch or invalid, falling back to anonymous auth:", tokenError);
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth initialization failed completely:", err);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    // Sync Events
    try {
      const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'calendar_events');
      const qEvents = query(eventsRef); 
      
      const unsubEvents = onSnapshot(qEvents, (snapshot) => {
        const loadedEvents = snapshot.docs.map(doc => {
          const data = doc.data();
          return { 
            id: doc.id, 
            ...data,
            content: String(data.content || ''),
            department: String(data.department || ''),
            section: String(data.section || '')
          };
        });
        setEvents(loadedEvents);
      }, (error) => console.error("Error fetching events:", error));

      // Sync Config
      const configRef = collection(db, 'artifacts', appId, 'public', 'data', 'calendar_config');
      const unsubConfig = onSnapshot(configRef, (snapshot) => {
        if (!snapshot.empty) {
          const serverConfig = snapshot.docs.find(d => d.id === 'main_config');
          if (serverConfig) {
            const data = serverConfig.data();
            setConfig({
              startDate: String(data.startDate || config.startDate),
              endDate: String(data.endDate || config.endDate),
              semesterName: String(data.semesterName || config.semesterName)
            });
          }
        }
      }, (error) => console.error("Error fetching config:", error));

      return () => {
        unsubEvents();
        unsubConfig();
      };
    } catch (e) {
      console.error("Firestore sync error:", e);
    }
  }, [user]);

  // --- Logic ---

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!user || !db) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'calendar_config', 'main_config'), config);
      setShowConfigModal(false);
    } catch (err) {
      console.error("Save config failed", err);
    }
  };

  const handleAddEvent = async () => {
    if (!newEventContent.trim() || !user || !db) return;

    const newEvent = {
      date: editingDate,
      content: String(newEventContent), 
      department: selectedDept.name,
      section: selectedSection,
      timestamp: Date.now(),
      authorId: user.uid
    };

    try {
      const docId = `${Date.now()}_${user.uid.slice(0,5)}`;
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'calendar_events', docId), newEvent);
      setNewEventContent("");
      setShowEventModal(false);
    } catch (err) {
      console.error("Add event failed", err);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!confirm("確定要刪除這個行程嗎？")) return;
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'calendar_events', eventId));
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const handlePrint = () => {
    // 強制在列印時使用列表模式 (通常較為正式)
    const originalMode = viewMode;
    setViewMode('list');
    setTimeout(() => {
      window.print();
      // Optional: restore view mode after print dialog closes (though user might prefer staying in list)
      // setViewMode(originalMode);
    }, 100);
  };

  // --- Data Processing for Views ---

  // 1. Grid View Data: Group by Weeks
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

      const dates = getDatesInRange(formatDate(displayStart), formatDate(displayEnd));
      
      return dates.map(date => {
        const dateStr = formatDate(date);
        const dayEvents = events.filter(e => e.date === dateStr);
        const inSemester = dateStr >= config.startDate && dateStr <= config.endDate;

        return {
          dateObj: date,
          dateStr,
          dayOfWeek: date.getDay(),
          events: dayEvents,
          inSemester
        };
      });
    } catch (e) {
      console.error("Error generating calendar days:", e);
      return [];
    }
  }, [config.startDate, config.endDate, events]);

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
    if (filterDept === "ALL") return weeksData;
    return weeksData; 
  }, [weeksData, filterDept]);


  // 2. List View Data: Sorted Events with Week Info
  const sortedEvents = useMemo(() => {
    const allEvents = [...events];
    if (filterDept !== "ALL") {
      return allEvents
        .filter(e => e.department === filterDept)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    return allEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [events, filterDept]);


  // --- Render ---

  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-800 font-sans print:bg-white">
      
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
          /* Hide non-print elements */
          .no-print { display: none !important; }
          /* Ensure table borders show up */
          table, th, td {
            border: 1px solid black !important;
            border-collapse: collapse !important;
          }
          /* Ensure list view is visible even if viewMode was grid */
          .print-visible { display: block !important; }
        }
      `}</style>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm print:hidden w-full no-print">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center py-4 space-y-4 md:space-y-0">
            
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-600 rounded-lg shadow-lg">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 leading-tight">學校行事曆協作平台</h1>
                <div 
                  className="flex items-center space-x-2 text-sm text-gray-500 cursor-pointer hover:text-indigo-600 transition-colors"
                  onClick={() => setShowConfigModal(true)}
                >
                  <span>{String(config.semesterName || '')}</span>
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                    {String(config.startDate)} ~ {String(config.endDate)}
                  </span>
                  <Settings className="w-3 h-3" />
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-3">
              
              {/* View Toggle */}
              <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'grid' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Grid className="w-4 h-4 mr-1.5" />
                  月曆
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'list' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <List className="w-4 h-4 mr-1.5" />
                  列表
                </button>
              </div>

              {/* Identity */}
              <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4 bg-gray-50 p-2 rounded-lg border border-gray-100">
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-600">目前身分：</span>
                </div>
                <div className="flex space-x-2">
                  <select 
                    value={selectedDept?.name} 
                    onChange={(e) => {
                      const dept = DEPARTMENTS.find(d => d.name === e.target.value);
                      if (dept) {
                        setSelectedDept(dept);
                        setSelectedSection(dept.sections[0]);
                      }
                    }}
                    className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-1"
                  >
                    {DEPARTMENTS.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                  </select>
                  <select 
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value)}
                    className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-1"
                  >
                    {selectedDept?.sections.map(s => <option key={s} value={s}>{s}</option>)}
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
                  {DEPARTMENTS.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </div>

              <button 
                onClick={handlePrint}
                className="flex items-center px-3 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors shadow-sm"
                title="列印行事曆"
              >
                <Printer className="w-4 h-4 mr-2" />
                <span className="text-sm">列印</span>
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-0 print:max-w-none print:w-full">
        
        <div className="hidden print:block text-center mb-6">
          <h1 className="text-2xl font-serif font-bold text-black">{String(config.semesterName)} 行事曆</h1>
          <p className="text-sm text-gray-600 mt-1">
            期間：{String(config.startDate)} 至 {String(config.endDate)}
          </p>
        </div>

        {/* --- GRID VIEW (CALENDAR) --- */}
        <div className={`${viewMode === 'grid' ? 'block' : 'hidden'} print:hidden space-y-8`}>
          {filteredWeeks.map((week, wIndex) => (
            <div key={wIndex} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                <span className="font-bold text-gray-800">第 {wIndex + 1} 週</span>
                <span className="text-xs text-gray-600">
                  {formatDate(week[0].dateObj)} - {formatDate(week[week.length-1].dateObj)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                {week.map((day) => {
                  const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
                  const displayEvents = filterDept === "ALL" 
                    ? day.events 
                    : day.events.filter(e => e.department === filterDept);

                  return (
                    <div 
                      key={day.dateStr} 
                      className={`
                        min-h-[150px] group flex flex-col 
                        ${isWeekend ? 'bg-gray-100/50' : 'bg-white'}
                        ${!day.inSemester ? 'opacity-50' : ''}
                      `}
                    >
                      <div className="p-2 border-b border-gray-100 flex justify-between items-center">
                        <div className="flex items-center space-x-1">
                          <span className={`text-sm font-bold ${isWeekend ? 'text-red-600' : 'text-gray-800'}`}>
                            {day.dateObj.getDate()}
                          </span>
                          <span className="text-xs text-gray-500">
                            ({WEEKS_ZH[day.dayOfWeek]})
                          </span>
                        </div>
                        <button 
                          onClick={() => {
                            setEditingDate(day.dateStr);
                            setShowEventModal(true);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-indigo-50 rounded text-indigo-600"
                          title="新增行程"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-2 space-y-1.5 flex-1">
                        {displayEvents.map((event) => {
                          const deptConfig = DEPARTMENTS.find(d => d.name === event.department) || DEPARTMENTS[0];
                          return (
                            <div 
                              key={event.id} 
                              className={`
                                text-xs p-1.5 rounded border ${deptConfig.color} relative group/event shadow-sm
                              `}
                            >
                              <div className="font-bold mb-0.5 flex justify-between">
                                <span>{String(event.department)}</span>
                                <button 
                                  onClick={() => handleDeleteEvent(event.id)}
                                  className="hidden group-hover/event:block text-red-700 hover:text-red-900"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="whitespace-pre-wrap break-words text-gray-900">
                                <span className="text-gray-700 mr-1 font-medium">[{String(event.section)}]</span>
                                {String(event.content)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {Array.from({ length: 7 - week.length }).map((_, i) => (
                   <div key={`empty-${i}`} className="hidden md:block bg-gray-50/30"></div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* --- LIST VIEW (TABLE - PRINT FORMAT) --- */}
        <div className={`${viewMode === 'list' ? 'block' : 'hidden'} print:block w-full overflow-x-auto`}>
           <table className="w-full text-sm text-left border-collapse border border-black">
             <thead className="bg-gray-100 text-gray-900 font-bold print:bg-gray-100">
               <tr>
                 <th className="border border-black px-4 py-2 w-16 text-center">週次</th>
                 <th className="border border-black px-4 py-2 w-32 text-center">起迄月日</th>
                 <th className="border border-black px-4 py-2">舉辦事項</th>
                 <th className="border border-black px-4 py-2 w-32 text-center">主辦單位</th>
                 <th className="border border-black px-4 py-2 w-32 text-center">協助單位</th>
                 <th className="border border-black px-4 py-2 w-24 text-center">執行情形</th>
                 <th className="border border-black px-4 py-2 w-24 text-center">備註</th>
                 <th className="border border-black px-2 py-2 w-12 text-center no-print">操作</th>
               </tr>
             </thead>
             <tbody>
               {sortedEvents.length > 0 ? (
                 sortedEvents.map((event, idx) => (
                   <tr key={event.id} className="hover:bg-gray-50 print:hover:bg-transparent">
                     <td className="border border-black px-4 py-2 text-center font-medium">
                       第{getWeekInfo(event.date, config.startDate)}週
                     </td>
                     <td className="border border-black px-4 py-2 text-center">
                       {formatDateZH(event.date)}
                     </td>
                     <td className="border border-black px-4 py-2 whitespace-pre-wrap">
                       {event.content}
                     </td>
                     <td className="border border-black px-4 py-2 text-center">
                       {event.department}
                     </td>
                     <td className="border border-black px-4 py-2 text-center">
                       {event.section}
                     </td>
                     <td className="border border-black px-4 py-2"></td>
                     <td className="border border-black px-4 py-2"></td>
                     <td className="border border-black px-2 py-2 text-center no-print">
                       <button 
                          onClick={() => handleDeleteEvent(event.id)}
                          className="text-red-600 hover:text-red-800 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                     </td>
                   </tr>
                 ))
               ) : (
                 <tr>
                   <td colSpan="8" className="border border-black px-4 py-8 text-center text-gray-500">
                     目前沒有任何行程資料
                   </td>
                 </tr>
               )}
             </tbody>
           </table>
        </div>

        {events.length === 0 && viewMode === 'grid' && (
          <div className="text-center py-20 text-gray-400 print:hidden">
            <Calendar className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>目前沒有任何行程，開始新增吧！</p>
          </div>
        )}
      </main>

      {/* Modals remain the same */}
      <Modal 
        isOpen={showConfigModal} 
        onClose={() => setShowConfigModal(false)}
        title="行事曆設定"
      >
        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">學期名稱</label>
            <input 
              type="text"
              value={config.semesterName}
              onChange={(e) => setConfig({...config, semesterName: e.target.value})}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
              <input 
                type="date"
                value={config.startDate}
                onChange={(e) => setConfig({...config, startDate: e.target.value})}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
              <input 
                type="date"
                value={config.endDate}
                onChange={(e) => setConfig({...config, endDate: e.target.value})}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
            <p>注意：修改日期範圍可能會導致部分已存在的行程無法在日曆上顯示。</p>
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
               <span className={`font-bold px-2 py-0.5 rounded text-xs ${selectedDept?.color}`}>
                 {selectedDept?.name} - {selectedSection}
               </span>
             </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">活動內容</label>
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