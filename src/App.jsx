import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  List, 
  Grid,
  AlertTriangle,
  FileSpreadsheet,
  Upload,
  Lock 
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
// Update labels as requested
const PRE_PERIOD_LABELS = ['學期前', '寒假前', '暑假前'];
const POST_PERIOD_LABELS = ['學期後', '寒假後', '暑假後'];

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

// Calculate week number relative to the Semester Start Date
const getWeekInfo = (dateStr, semesterStartDateStr) => {
  const d = new Date(dateStr);
  const start = new Date(semesterStartDateStr || dateStr);
  
  const startDay = start.getDay();
  const adjustedStart = new Date(start);
  adjustedStart.setDate(start.getDate() - startDay); // Anchor Sunday
  
  const diffTime = d.getTime() - adjustedStart.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const diffDays = Math.floor(diffTime / oneDay);
  
  return Math.floor(diffDays / 7) + 1;
};

// Calculate week date range string
const getWeekRangeString = (weekNum, semesterStartDateStr) => {
  const start = new Date(semesterStartDateStr);
  const startDay = start.getDay();
  const adjustedStart = new Date(start);
  adjustedStart.setDate(start.getDate() - startDay); // Anchor Sunday

  const weekStart = new Date(adjustedStart);
  weekStart.setDate(adjustedStart.getDate() + (weekNum - 1) * 7);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const formatSimple = (d) => {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}/${day}`;
  };

  return `${formatSimple(weekStart)}~${formatSimple(weekEnd)}`;
};

// Simple CSV Line Parser (handles quotes)
const parseCSVLine = (text) => {
  const result = [];
  let cell = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuote && text[i + 1] === '"') {
        cell += '"';
        i++; // skip escaped quote
      } else {
        inQuote = !inQuote;
      }
    } else if (c === ',' && !inQuote) {
      result.push(cell);
      cell = '';
    } else {
      cell += c;
    }
  }
  result.push(cell);
  return result;
};

// Smart Date Parser for Import
const parseImportDate = (datePart, startDateStr, endDateStr) => {
  const match = datePart.match(/(\d{1,2})[\/-](\d{1,2})/);
  if (!match) return null;
  
  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  let candidate = new Date(startYear, month - 1, day);
  let candidateStr = `${candidate.getFullYear()}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  
  if (candidateStr >= startDateStr && candidateStr <= endDateStr) return candidateStr;
  
  if (endYear !== startYear) {
     candidate = new Date(endYear, month - 1, day);
     candidateStr = `${candidate.getFullYear()}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
     if (candidateStr >= startDateStr && candidateStr <= endDateStr) return candidateStr;
  }
  
  return `${startYear}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
};

// --- Components ---

// Modal Component
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 print:hidden">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-fade-in max-h-[90vh] overflow-y-auto">
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
    semesterStartDate: formatDate(new Date()), 
    semesterEndDate: formatDate(new Date(new Date().setMonth(new Date().getMonth() + 4))), 
    preSemesterLabel: '學期前', 
    postSemesterLabel: '寒假後', 
    semesterName: '113學年度第二學期'
  });
  
  // Refs
  const fileInputRef = useRef(null);

  // Local UI State
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0]);
  const [selectedSection, setSelectedSection] = useState(DEPARTMENTS[0].sections[0]);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false); 
  const [inputPassword, setInputPassword] = useState(""); 
  const [editingDate, setEditingDate] = useState(null);
  const [newEventContent, setNewEventContent] = useState("");
  const [filterDept, setFilterDept] = useState("ALL");
  const [viewMode, setViewMode] = useState('grid'); 

  // --- Helper to determine label ---
  // Modified to use whitespace-nowrap in CSS instead of relying on string content
  const getWeekLabel = (weekNum) => {
    if (weekNum < 1) {
      const preWeekNum = Math.abs(weekNum) + 1;
      return `${config.preSemesterLabel || '學期前'} 第${preWeekNum}週`;
    }

    if (config.semesterEndDate) {
      const endWeekNum = getWeekInfo(config.semesterEndDate, config.semesterStartDate);
      
      if (weekNum > endWeekNum) {
        const vacationWeekNum = weekNum - endWeekNum;
        return `${config.postSemesterLabel || '寒假後'} 第${vacationWeekNum}週`;
      }
    }

    return `第${weekNum}週`;
  };

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

      const configRef = collection(db, 'artifacts', appId, 'public', 'data', 'calendar_config');
      const unsubConfig = onSnapshot(configRef, (snapshot) => {
        if (!snapshot.empty) {
          const serverConfig = snapshot.docs.find(d => d.id === 'main_config');
          if (serverConfig) {
            const data = serverConfig.data();
            
            let preLabel = String(data.preSemesterLabel || '學期前');
            if (preLabel === '開學前') preLabel = '學期前';

            setConfig({
              startDate: String(data.startDate || config.startDate),
              endDate: String(data.endDate || config.endDate),
              semesterStartDate: String(data.semesterStartDate || data.firstWeekDate || data.startDate || config.startDate),
              semesterEndDate: String(data.semesterEndDate || config.endDate),
              preSemesterLabel: preLabel,
              postSemesterLabel: String(data.postSemesterLabel || '寒假後'),
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

  const handleVerifyPassword = (e) => {
    e.preventDefault();
    if (inputPassword === '168') {
      setShowPasswordModal(false);
      setShowConfigModal(true);
      setInputPassword(""); 
    } else {
      alert("密碼錯誤，請重新輸入。");
      setInputPassword("");
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!user || !db) return;
    try {
      const cleanConfig = {
        startDate: config.startDate,
        endDate: config.endDate,
        semesterStartDate: config.semesterStartDate,
        semesterEndDate: config.semesterEndDate,
        preSemesterLabel: config.preSemesterLabel,
        postSemesterLabel: config.postSemesterLabel,
        semesterName: config.semesterName
      };
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'calendar_config', 'main_config'), cleanConfig);
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

  const handleDeleteAllEvents = async () => {
    if (!confirm("嚴重警告：此操作將永久刪除「所有」行事曆內容，無法復原！\n\n您確定要清空整個行事曆嗎？")) return;
    
    const doubleCheck = prompt("請輸入「刪除」二字以確認清空所有資料：");
    if (doubleCheck !== "刪除") {
      alert("取消刪除操作");
      return;
    }

    if (!db) return;

    try {
      const deletePromises = events.map(event => 
        deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'calendar_events', event.id))
      );
      
      await Promise.all(deletePromises);
      alert("已成功清空所有行程。");
    } catch (err) {
      console.error("Delete all failed", err);
      alert("刪除失敗，請檢查網路連線或權限。");
    }
  };

  const handlePrint = () => {
    const originalMode = viewMode;
    setViewMode('list');
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleExportCSV = () => {
    const headers = ["週次", "日期", "舉辦事項", "主辦單位", "協助單位", "執行情形", "備註"];
    const csvRows = [headers.join(',')];
    
    let exportEvents = [...events];
    if (filterDept !== "ALL") {
      exportEvents = exportEvents.filter(e => e.department === filterDept);
    }
    exportEvents.sort((a, b) => new Date(a.date) - new Date(b.date));

    exportEvents.forEach(event => {
      const weekNum = getWeekInfo(event.date, config.semesterStartDate || config.startDate);
      const weekLabel = getWeekLabel(weekNum).replace('\n', ' '); 
      const dateStr = formatDateZH(event.date);
      
      const content = `"${event.content.replace(/"/g, '""')}"`;
      const dept = event.department;
      const sect = event.section;
      
      const row = [weekLabel, dateStr, content, dept, sect, "", ""];
      csvRows.push(row.join(','));
    });

    const csvString = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${config.semesterName}_行事曆.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleProcessImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm("匯入功能將會「新增」資料到目前的行事曆中。\n\n如果您想要完全替換，請先到「設定」中執行「刪除所有行程」，再進行匯入。\n\n確定要繼續匯入嗎？")) {
      e.target.value = ''; 
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const rows = text.split(/\r?\n/);
        
        let successCount = 0;
        let batchPromises = [];

        for (let i = 1; i < rows.length; i++) {
          const rowText = rows[i].trim();
          if (!rowText) continue;

          const cols = parseCSVLine(rowText);
          if (cols.length < 3) continue; 

          const dateStrRaw = cols[1];
          const content = cols[2];
          const dept = cols[3] || '其他'; 
          const section = cols[4] || '';

          if (!dateStrRaw || !content) continue;

          const dbDate = parseImportDate(dateStrRaw, config.startDate, config.endDate);
          
          if (dbDate) {
            const newEvent = {
              date: dbDate,
              content: content.replace(/^"|"$/g, '').replace(/""/g, '"'), 
              department: dept,
              section: section,
              timestamp: Date.now(),
              authorId: user?.uid || 'imported'
            };

            const docId = `${Date.now()}_import_${i}`;
            batchPromises.push(
              setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'calendar_events', docId), newEvent)
            );
            successCount++;
          }
        }

        await Promise.all(batchPromises);
        alert(`匯入完成！成功新增了 ${successCount} 筆行程。`);
        
      } catch (err) {
        console.error("Import failed:", err);
        alert("匯入失敗，請檢查檔案格式是否正確。");
      } finally {
        e.target.value = ''; 
      }
    };
    reader.readAsText(file);
  };

  // --- Data Processing ---

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
        const weekNum = getWeekInfo(dateStr, config.semesterStartDate || config.startDate);

        return {
          dateObj: date,
          dateStr,
          dayOfWeek: date.getDay(),
          events: dayEvents,
          inSemester,
          weekNum
        };
      });
    } catch (e) {
      console.error("Error generating calendar days:", e);
      return [];
    }
  }, [config.startDate, config.endDate, config.semesterStartDate, events]);

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

  const processedList = useMemo(() => {
    let baseEvents = [...events];
    if (filterDept !== "ALL") {
      baseEvents = baseEvents.filter(e => e.department === filterDept);
    }
    baseEvents.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (!baseEvents.length) return [];

    const anchorDate = config.semesterStartDate || config.startDate;
    const enriched = baseEvents.map(e => ({
      ...e,
      weekNum: getWeekInfo(e.date, anchorDate)
    }));

    const result = [];
    for (let i = 0; i < enriched.length; i++) {
      const current = { ...enriched[i] }; 
      
      const prev = i > 0 ? enriched[i - 1] : null;
      
      if (!prev || prev.weekNum !== current.weekNum) {
        let span = 1;
        for (let j = i + 1; j < enriched.length; j++) {
          if (enriched[j].weekNum === current.weekNum) {
            span++;
          } else {
            break;
          }
        }
        current.weekRowSpan = span;
      } else {
        current.weekRowSpan = 0; 
      }

      if (!prev || prev.date !== current.date) {
        let span = 1;
        for (let k = i + 1; k < enriched.length; k++) {
          if (enriched[k].date === current.date) {
            span++;
          } else {
            break;
          }
        }
        current.dateRowSpan = span;
      } else {
        current.dateRowSpan = 0;
      }

      result.push(current);
    }

    return result;
  }, [events, filterDept, config.startDate, config.semesterStartDate]);


  // --- Render ---

  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-800 font-sans print:bg-white flex flex-col items-center">
      
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
          .no-print { display: none !important; }
          table, th, td {
            border: 1px solid black !important;
            border-collapse: collapse !important;
          }
          .print-visible { display: block !important; }
        }
      `}</style>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm print:hidden w-full no-print flex justify-center">
        <div className="w-[95%] max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center py-4 space-y-4 md:space-y-0">
            
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-600 rounded-lg shadow-lg">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 leading-tight">學校行事曆協作平台</h1>
                <div 
                  className="flex items-center space-x-2 text-sm text-gray-500 cursor-pointer hover:text-indigo-600 transition-colors"
                  onClick={() => setShowPasswordModal(true)}
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
                    className="text-sm bg-white border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-1"
                  >
                    {DEPARTMENTS.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                  </select>
                  <select 
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value)}
                    className="text-sm bg-white border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-1"
                  >
                    {selectedDept?.sections.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <select 
                  value={filterDept} 
                  onChange={(e) => setFilterDept(e.target.value)}
                  className="text-sm bg-white border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-1"
                >
                  <option value="ALL">顯示所有處室</option>
                  {DEPARTMENTS.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </div>

              <div className="flex space-x-2">
                <button 
                  onClick={handleImportClick}
                  className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm"
                  title="匯入 CSV"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  <span className="text-sm">匯入</span>
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleProcessImport} 
                  accept=".csv" 
                  hidden 
                />

                <button 
                  onClick={handleExportCSV}
                  className="flex items-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors shadow-sm"
                  title="匯出成 CSV (可由Excel開啟)"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  <span className="text-sm">匯出</span>
                </button>
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
        </div>
      </header>

      {/* Main Content */}
      <main className="w-[95%] max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-0 print:max-w-none print:w-full">
        
        <div className="hidden print:block text-center mb-6">
          <h1 className="text-2xl font-serif font-bold text-black">{String(config.semesterName)} 行事曆</h1>
          <p className="text-sm text-gray-600 mt-1">
            期間：{String(config.startDate)} 至 {String(config.endDate)}
          </p>
        </div>

        {/* --- GRID VIEW (CALENDAR) --- */}
        <div className={`${viewMode === 'grid' ? 'block' : 'hidden'} print:hidden space-y-8`}>
          {filteredWeeks.map((week, wIndex) => {
            const weekNum = week[0].weekNum;
            const weekLabel = getWeekLabel(weekNum);
            
            return (
              <div key={wIndex} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                  <span className="font-bold text-gray-800 whitespace-nowrap text-sm">{weekLabel}</span>
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
            );
          })}
        </div>

        {/* --- LIST VIEW (TABLE - PRINT FORMAT) --- */}
        <div className={`${viewMode === 'list' ? 'block' : 'hidden'} print:block w-full overflow-x-auto`}>
           <table className="w-full text-sm text-left border-collapse border border-black table-fixed">
             <thead className="bg-gray-100 text-gray-900 font-bold print:bg-gray-100">
               <tr>
                 <th className="border border-black px-2 py-2 w-28 text-center">週次</th>
                 <th className="border border-black px-2 py-2 w-24 text-center">日期</th>
                 <th className="border border-black px-2 py-2 w-auto">舉辦事項</th>
                 <th className="border border-black px-2 py-2 w-24 text-center">主辦單位</th>
                 <th className="border border-black px-2 py-2 w-24 text-center">協助單位</th>
                 <th className="border border-black px-2 py-2 w-20 text-center">執行情形</th>
                 <th className="border border-black px-2 py-2 w-20 text-center">備註</th>
                 <th className="border border-black px-2 py-2 w-10 text-center no-print">操作</th>
               </tr>
             </thead>
             <tbody>
               {processedList.length > 0 ? (
                 processedList.map((event, idx) => (
                   <tr key={event.id} className="hover:bg-gray-50 print:hover:bg-transparent">
                     {/* Week Column (Merged) */}
                     {event.weekRowSpan > 0 && (
                       <td 
                         className="border border-black px-2 py-1 text-center font-medium align-top bg-white" 
                         rowSpan={event.weekRowSpan}
                       >
                         <div className="flex flex-col items-center justify-center h-full">
                           <span className="text-base whitespace-nowrap leading-tight">
                             {getWeekLabel(event.weekNum)}
                           </span>
                           <span className="text-[10px] text-gray-500 mt-1">
                             {getWeekRangeString(event.weekNum, config.semesterStartDate || config.startDate)}
                           </span>
                         </div>
                       </td>
                     )}
                     
                     {/* Date Column (Merged) */}
                     {event.dateRowSpan > 0 && (
                       <td 
                        className="border border-black px-2 py-1 text-center align-top bg-white"
                        rowSpan={event.dateRowSpan}
                       >
                         {formatDateZH(event.date)}
                       </td>
                     )}

                     <td className="border border-black px-2 py-1 whitespace-pre-wrap align-top">
                       {event.content}
                     </td>
                     <td className="border border-black px-2 py-1 text-center align-top">
                       {event.department}
                     </td>
                     <td className="border border-black px-2 py-1 text-center align-top">
                       {event.section}
                     </td>
                     <td className="border border-black px-2 py-1 align-top"></td>
                     <td className="border border-black px-2 py-1 align-top"></td>
                     <td className="border border-black px-1 py-1 text-center no-print align-top">
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

      {/* Password Modal */}
      <Modal 
        isOpen={showPasswordModal} 
        onClose={() => { setShowPasswordModal(false); setInputPassword(""); }}
        title="請輸入管理密碼"
      >
        <form onSubmit={handleVerifyPassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
            <input 
              type="password"
              value={inputPassword}
              onChange={(e) => setInputPassword(e.target.value)}
              className="w-full bg-white rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="請輸入密碼"
              autoFocus
            />
          </div>
          <button 
            type="submit"
            className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Lock className="w-4 h-4 mr-2" />
            驗證
          </button>
        </form>
      </Modal>

      {/* Config Modal */}
      <Modal 
        isOpen={showConfigModal} 
        onClose={() => setShowConfigModal(false)}
        title="行事曆設定"
      >
        <div className="space-y-6">
          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">學期名稱</label>
              <input 
                type="text"
                value={config.semesterName}
                onChange={(e) => setConfig({...config, semesterName: e.target.value})}
                className="w-full bg-white rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
            
            <div className="border-t border-gray-200 pt-4 mt-2">
              <h4 className="text-sm font-bold text-gray-800 mb-3">學期起訖與階段設定</h4>
              
              {/* Row 1: Overall Range */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">表格開始日期</label>
                  <input 
                    type="date"
                    value={config.startDate}
                    onChange={(e) => setConfig({...config, startDate: e.target.value})}
                    className="w-full bg-white rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">表格結束日期</label>
                  <input 
                    type="date"
                    value={config.endDate}
                    onChange={(e) => setConfig({...config, endDate: e.target.value})}
                    className="w-full bg-white rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Row 2: Semester Start Config */}
              <div className="flex space-x-2 mb-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    學期開始日 (第1週)
                  </label>
                  <input 
                    type="date"
                    value={config.semesterStartDate || config.startDate}
                    onChange={(e) => setConfig({...config, semesterStartDate: e.target.value})}
                    className="w-full bg-white rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border-l-4 border-l-blue-500"
                  />
                </div>
                <div className="w-1/2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">開始日之前稱為</label>
                  <select
                    value={config.preSemesterLabel}
                    onChange={(e) => setConfig({...config, preSemesterLabel: e.target.value})}
                    className="w-full bg-white rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  >
                    {PRE_PERIOD_LABELS.map(label => (
                      <option key={`pre-${label}`} value={label}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Semester End Config */}
              <div className="flex space-x-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    學期結束日
                  </label>
                  <input 
                    type="date"
                    value={config.semesterEndDate || config.endDate}
                    onChange={(e) => setConfig({...config, semesterEndDate: e.target.value})}
                    className="w-full bg-white rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border-l-4 border-l-orange-500"
                  />
                </div>
                <div className="w-1/2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">結束日之後稱為</label>
                  <select
                    value={config.postSemesterLabel}
                    onChange={(e) => setConfig({...config, postSemesterLabel: e.target.value})}
                    className="w-full bg-white rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  >
                    {POST_PERIOD_LABELS.map(label => (
                      <option key={`post-${label}`} value={label}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
              <ul className="list-disc list-inside space-y-1">
                <li>學期開始日之前 = <strong>{config.preSemesterLabel}第X週</strong></li>
                <li>學期期間 = <strong>第X週</strong></li>
                <li>學期結束日之後 = <strong>{config.postSemesterLabel}第X週</strong></li>
              </ul>
            </div>

            <button 
              type="submit"
              className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Save className="w-4 h-4 mr-2" />
              儲存設定
            </button>
          </form>

          {/* Danger Zone */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-bold text-red-600 mb-2 flex items-center">
              <AlertTriangle className="w-4 h-4 mr-1" />
              危險區域
            </h4>
            <p className="text-xs text-gray-500 mb-3">此操作將清空目前所有的行事曆活動，請謹慎使用。</p>
            <button 
              type="button"
              onClick={handleDeleteAllEvents}
              className="w-full flex justify-center items-center py-2 px-4 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              刪除所有行程內容
            </button>
          </div>
        </div>
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
              className="w-full bg-white rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
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