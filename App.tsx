
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  ClipboardList, 
  Camera, 
  Download, 
  Trash2, 
  Clock, 
  BarChart3,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Users,
  Upload,
  Database,
  Search,
  Wifi,
  WifiOff,
  Share2,
  Settings,
  X,
  Info,
  Globe
} from 'lucide-react';
import { StudentRecord, StudentProfile } from './types';
import Scanner from './components/Scanner';
import { exportToExcel, parseRosterFile } from './services/excelService';
import { analyzeLateArrivals } from './services/geminiService';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';
import Gun from 'gun';

const LATE_THRESHOLD = "08:30";

// Initialize Gun with multiple redundant relay peers for high availability
const gun = Gun({
  peers: [
    'https://gun-manhattan.herokuapp.com/gun',
    'https://relay.peer.ooo/gun',
    'https://gun-us.herokuapp.com/gun'
  ]
});

const App: React.FC = () => {
  const [records, setRecords] = useState<StudentRecord[]>([]);
  const [roster, setRoster] = useState<StudentProfile[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<StudentRecord | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Real-time Sync State
  const [syncCode, setSyncCode] = useState<string>(localStorage.getItem('late_scan_sync_code') || '');
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncActivity, setLastSyncActivity] = useState<number>(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync Log Logic with Gun.js
  useEffect(() => {
    if (!syncCode) {
      setIsSyncing(false);
      return;
    }

    setIsSyncing(true);
    // Use a unique namespace to avoid collisions with other apps using the same relays
    const room = gun.get('latescan-v2-room-' + syncCode);

    // Listen for new records from other locations
    room.get('records').map().on((data: any) => {
      if (!data || !data.id) return;
      
      setLastSyncActivity(Date.now());
      
      setRecords(prev => {
        // Prevent duplicates and sort
        const exists = prev.some(r => r.id === data.id);
        if (exists) return prev;
        
        const newRecords = [data as StudentRecord, ...prev];
        return newRecords.sort((a, b) => {
          // Fallback sorting by timestamp hidden in ID or creation
          return b.arrivalTime.localeCompare(a.arrivalTime);
        });
      });
    });

    return () => {
      room.get('records').off();
    };
  }, [syncCode]);

  // Load roster from localStorage on mount
  useEffect(() => {
    const savedRoster = localStorage.getItem('student_roster');
    if (savedRoster) setRoster(JSON.parse(savedRoster));
    
    // Only load records from local storage if NOT in sync mode
    // In sync mode, records are populated from the Gun graph
    if (!syncCode) {
      const savedRecords = localStorage.getItem('attendance_records');
      if (savedRecords) setRecords(JSON.parse(savedRecords));
    }
  }, [syncCode]);

  // Persistent backups
  useEffect(() => {
    localStorage.setItem('student_roster', JSON.stringify(roster));
  }, [roster]);

  useEffect(() => {
    // We only backup attendance locally if we aren't syncing globally
    if (!syncCode) {
      localStorage.setItem('attendance_records', JSON.stringify(records));
    }
  }, [records, syncCode]);

  // Clock Update
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleRosterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const profiles = await parseRosterFile(file);
      setRoster(profiles);
      alert(`Successfully imported ${profiles.length} student profiles.`);
    } catch (err) {
      alert("Failed to parse roster file. Please ensure it's a valid Excel or CSV file with headers: studentId, name, class.");
      console.error(err);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleScanSuccess = useCallback((decodedText: string) => {
    let scannedId = decodedText;
    try {
      const parsed = JSON.parse(decodedText);
      scannedId = parsed.studentId || parsed.id || decodedText;
    } catch {
      scannedId = decodedText;
    }

    const studentProfile = roster.find(s => s.studentId === scannedId);
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString();

    const resultRecord: StudentRecord = {
      id: `${Date.now()}-${scannedId}`,
      studentId: scannedId,
      name: studentProfile?.name || "Unregistered Student",
      class: studentProfile?.class || "N/A",
      arrivalTime: timeString,
      date: dateString,
      status: (timeString >= LATE_THRESHOLD) ? 'Late' : 'On-Time',
      isVerified: !!studentProfile
    };

    // Only log the student if they are actually LATE (as per requirement)
    if (resultRecord.status === 'Late') {
      // Optimistic Update: Add to local state immediately so user sees result instantly
      setRecords(prev => {
        if (prev.some(r => r.id === resultRecord.id)) return prev;
        return [resultRecord, ...prev];
      });

      // Background Sync: Propagate to Gun graph
      if (syncCode) {
        gun.get('latescan-v2-room-' + syncCode).get('records').get(resultRecord.id).put(resultRecord);
      }
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      osc.connect(audioCtx.destination);
      osc.frequency.value = 850;
      osc.start();
      setTimeout(() => osc.stop(), 100);
    }

    setLastScanned(resultRecord);
    setIsScanning(false);
  }, [roster, syncCode]);

  const toggleSync = () => {
    setShowSyncModal(true);
  };

  const saveSyncCode = (code: string) => {
    const cleanCode = code.trim();
    localStorage.setItem('late_scan_sync_code', cleanCode);
    setSyncCode(cleanCode);
    if (cleanCode) setRecords([]); // Clear records to allow Gun to populate the room's data
    setShowSyncModal(false);
  };

  const clearRecords = () => {
    if (confirm("Clear local view? This will NOT delete data from other synced devices.")) {
      setRecords([]);
      setLastScanned(null);
      setAiAnalysis(null);
    }
  };

  const handleExport = () => {
    if (records.length === 0) return alert("No records to export!");
    exportToExcel(records);
  };

  const runAnalysis = async () => {
    if (records.length < 2) return alert("Need more data for AI analysis.");
    setIsAnalyzing(true);
    try {
      const result = await analyzeLateArrivals(records);
      setAiAnalysis(result);
    } catch (err) {
      alert("Failed to get AI analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const chartData = useMemo(() => {
    const hours: Record<string, number> = {};
    records.forEach(r => {
      const hour = r.arrivalTime.split(':')[0] + ":00";
      hours[hour] = (hours[hour] || 0) + 1;
    });
    return Object.entries(hours).map(([time, count]) => ({ time, count }));
  }, [records]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans selection:bg-indigo-100">
      
      <header className="bg-indigo-700 text-white shadow-lg sticky top-0 z-50 border-b border-indigo-800 backdrop-blur-md bg-indigo-700/95">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl shadow-inner">
              <ClipboardList className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-black leading-none tracking-tight">LateScan <span className="text-indigo-300">Live</span></h1>
              <div className="flex items-center gap-2 mt-0.5">
                {isSyncing ? (
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-300">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${Date.now() - lastSyncActivity < 2000 ? 'animate-ping' : ''}`}></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                    </span>
                    Real-time Sync Active
                  </span>
                ) : (
                  <span className="text-[9px] font-black uppercase tracking-widest text-indigo-300/60 flex items-center gap-1">
                    <WifiOff className="w-2.5 h-2.5" /> Standalone Mode
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
             <button 
              onClick={toggleSync}
              className={`p-2.5 rounded-xl border transition-all ${
                isSyncing ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-white/10 border-white/10 text-white hover:bg-white/20'
              }`}
              title="Real-time Sync Settings"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex bg-black/20 px-4 py-2 rounded-xl items-center gap-3 border border-white/10">
              <Clock className="w-4 h-4 text-indigo-300" />
              <span className="font-mono text-base font-bold">{currentTime.toLocaleTimeString()}</span>
            </div>
            <button 
              onClick={() => setIsScanning(!isScanning)}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl font-black transition-all shadow-lg active:scale-95 ${
                isScanning ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' : 'bg-white text-indigo-700 hover:bg-indigo-50 shadow-indigo-700/10'
              }`}
            >
              <Camera className="w-4 h-4" />
              {isScanning ? 'STOP' : 'SCAN'}
            </button>
          </div>
        </div>
      </header>

      {showSyncModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Cloud Sync Room</h3>
                  <p className="text-slate-500 text-sm font-medium mt-1">Share a code to sync with other gates.</p>
                </div>
                <button onClick={() => setShowSyncModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex gap-4">
                  <Globe className="w-6 h-6 text-indigo-600 shrink-0" />
                  <p className="text-xs text-indigo-800 leading-relaxed font-medium">
                    Enter a secret code (e.g. <strong>"SCHOOL-MAIN-GATE"</strong>). Any device using the same code will see logs in real-time.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Sync Code / Room ID</label>
                  <input 
                    type="text" 
                    defaultValue={syncCode}
                    placeholder="e.g. HighSchool-South"
                    id="sync-input"
                    className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 focus:outline-none transition-all placeholder:text-slate-300"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4">
                  <button 
                    onClick={() => saveSyncCode('')}
                    className="py-4 rounded-2xl font-black text-slate-500 hover:bg-slate-50 transition-all text-sm uppercase tracking-widest border border-slate-200"
                  >
                    Disconnect
                  </button>
                  <button 
                    onClick={() => {
                      const val = (document.getElementById('sync-input') as HTMLInputElement).value;
                      saveSyncCode(val);
                    }}
                    className="py-4 rounded-2xl font-black bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all text-sm uppercase tracking-widest"
                  >
                    Join Room
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                Distributed Sync via Gun.js P2P
              </p>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        <div className="lg:col-span-4 space-y-6">
          
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden group">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center transition-colors group-hover:bg-indigo-50/30">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-600" /> Student Database
              </h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${
                roster.length > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {roster.length > 0 ? 'Active' : 'Missing'}
              </span>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-3xl font-black text-slate-900 tracking-tighter">{roster.length.toLocaleString()}</p>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wide">Registered Students</p>
                </div>
                <div className="p-4 bg-indigo-50 rounded-2xl text-indigo-600 group-hover:scale-110 transition-transform duration-300">
                  <Users className="w-9 h-9" />
                </div>
              </div>
              
              <div className="mb-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex gap-3">
                <div className="bg-blue-100 p-2 rounded-lg h-fit text-blue-600">
                  <Info className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Upload Format</h4>
                  <p className="text-xs text-blue-800 font-bold leading-relaxed">
                    CSV/Excel must have headers:
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {['studentId', 'name', 'class'].map(header => (
                      <span key={header} className="bg-white px-2 py-0.5 rounded border border-blue-200 text-[10px] font-mono font-bold text-blue-600">
                        {header}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleRosterUpload} 
                className="hidden" 
                accept=".xlsx, .xls, .csv" 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-3 py-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all font-black shadow-lg shadow-indigo-100"
              >
                <Upload className="w-5 h-5" /> 
                Update Student List
              </button>
            </div>
          </div>

          {(isScanning || lastScanned) && (
            <div className="space-y-4">
              {isScanning && (
                <div className="bg-black rounded-[2.5rem] shadow-2xl overflow-hidden aspect-square relative border-8 border-white ring-1 ring-slate-200 group">
                  <Scanner onScanSuccess={handleScanSuccess} />
                  <div className="absolute top-4 left-0 right-0 flex justify-center z-10">
                     <span className="bg-black/50 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black text-white uppercase tracking-widest">
                       Scanning Student ID
                     </span>
                  </div>
                </div>
              )}

              {lastScanned && !isScanning && (
                <div className={`p-8 rounded-[2rem] shadow-xl border-2 animate-in slide-in-from-bottom-2 duration-300 ${
                  lastScanned.status === 'Late' ? 'bg-red-50 border-red-200 shadow-red-100/50' : 'bg-emerald-50 border-emerald-200 shadow-emerald-100/50'
                }`}>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                      {lastScanned.isVerified ? (
                        <span className="bg-white/80 backdrop-blur text-emerald-700 text-[9px] px-2.5 py-1 rounded-lg font-black uppercase flex items-center gap-1 border border-emerald-100 shadow-sm">
                          <CheckCircle2 className="w-3 h-3" /> Database Match
                        </span>
                      ) : (
                        <span className="bg-white/80 backdrop-blur text-amber-700 text-[9px] px-2.5 py-1 rounded-lg font-black uppercase flex items-center gap-1 border border-amber-100 shadow-sm">
                          <AlertCircle className="w-3 h-3" /> Unregistered
                        </span>
                      )}
                      <span className={`text-[9px] px-2.5 py-1 rounded-lg font-black uppercase border shadow-sm ${
                        lastScanned.status === 'Late' ? 'bg-red-600 text-white border-red-700' : 'bg-emerald-600 text-white border-emerald-700'
                      }`}>
                        {lastScanned.status}
                      </span>
                    </div>
                    <h3 className="text-3xl font-black text-slate-900 leading-tight tracking-tight">{lastScanned.name}</h3>
                    <div className="flex gap-2 mt-2">
                      <span className="bg-slate-900/5 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 border border-slate-200/50">ID {lastScanned.studentId}</span>
                      <span className="bg-slate-900/5 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 border border-slate-200/50">Class {lastScanned.class}</span>
                    </div>
                    <div className="mt-6 flex items-center gap-3 text-2xl font-mono font-black text-slate-800 bg-white shadow-md w-fit px-6 py-3 rounded-2xl border border-slate-100">
                      <Clock className="w-6 h-6 text-indigo-500" />
                      {lastScanned.arrivalTime}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-xs font-black mb-6 flex items-center gap-2 text-slate-400 uppercase tracking-widest">
              <BarChart3 className="w-4 h-4 text-indigo-600" /> Late Arrival Trends
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-8">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block mb-1">Late Count</span>
                <span className="text-3xl font-black text-red-600">{records.length}</span>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block mb-1">Policy Gate</span>
                <span className="text-3xl font-black text-slate-800">{LATE_THRESHOLD}</span>
              </div>
            </div>

            {chartData.length > 0 && (
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="time" fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontWeight: 600}} />
                    <YAxis allowDecimals={false} fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontWeight: 600}} />
                    <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} />
                    <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col min-h-[600px]">
            <div className="px-8 py-8 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-6">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                  Attendance Records
                  {isSyncing && (
                    <div className="flex items-center gap-2">
                       <Share2 className={`w-6 h-6 text-emerald-500 ${Date.now() - lastSyncActivity < 5000 ? 'animate-pulse' : ''}`} />
                       <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full border border-emerald-100">Live Room: {syncCode}</span>
                    </div>
                  )}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                   <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                   <p className="text-slate-500 text-sm font-bold">
                     {isSyncing ? 'Synchronized across multiple gates' : 'Local recording only'}
                   </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={handleExport}
                  disabled={records.length === 0}
                  className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all font-black shadow-lg disabled:opacity-50 active:scale-95"
                >
                  <Download className="w-5 h-5" /> EXPORT
                </button>
                <button 
                  onClick={clearRecords}
                  className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all border border-slate-100"
                  title="Clear Local Display"
                >
                  <Trash2 className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] border-b border-slate-100 sticky top-0 z-10">
                    <th className="px-8 py-5">Student Information</th>
                    <th className="px-8 py-5">Class</th>
                    <th className="px-8 py-5">Arrival</th>
                    <th className="px-8 py-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-8 py-32 text-center">
                        <div className="flex flex-col items-center max-w-xs mx-auto">
                          <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                            <Search className="w-10 h-10 text-indigo-200" />
                          </div>
                          <p className="text-xl font-black text-slate-800">Queue Empty</p>
                          <p className="text-slate-400 font-medium text-sm mt-2">
                            {isSyncing 
                              ? "Waiting for logs from this or other connected gate scanners..." 
                              : "Scan late students to begin building today's attendance log."
                            }
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    records.map((record) => (
                      <tr key={record.id} className="hover:bg-indigo-50/20 transition-colors group animate-in slide-in-from-left-2 duration-300">
                        <td className="px-8 py-6">
                          <div className="font-black text-slate-900 text-lg leading-tight group-hover:text-indigo-700 transition-colors">{record.name}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">ID: {record.studentId}</div>
                        </td>
                        <td className="px-8 py-6">
                          <span className="text-sm font-black text-slate-700 bg-white border border-slate-200 px-4 py-1.5 rounded-xl shadow-sm">
                            {record.class}
                          </span>
                        </td>
                        <td className="px-8 py-6">
                          <span className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-black bg-red-100 text-red-600 border border-red-200 shadow-sm">
                            {record.arrivalTime}
                          </span>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex items-center gap-2 justify-end">
                             {record.isVerified ? (
                                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded uppercase tracking-tighter">Verified</span>
                             ) : (
                                <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-1 rounded uppercase tracking-tighter">Guest</span>
                             )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {records.length >= 2 && (
              <div className="m-6 p-8 bg-indigo-900 text-white rounded-[2.5rem] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                   <Sparkles className="w-48 h-48" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-400 rounded-lg shadow-lg shadow-amber-500/20">
                        <Sparkles className="w-5 h-5 text-indigo-900" />
                      </div>
                      <h4 className="font-black text-xl tracking-tight">AI Gate Intelligence</h4>
                    </div>
                    {!aiAnalysis && (
                      <button 
                        onClick={runAnalysis}
                        disabled={isAnalyzing}
                        className="px-6 py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl font-black transition-all border border-white/20 active:scale-95 text-sm"
                      >
                        {isAnalyzing ? 'Analyzing Trends...' : 'Summarize Insights'}
                      </button>
                    )}
                  </div>
                  {aiAnalysis && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-500">
                      <p className="text-base text-indigo-100 leading-relaxed font-bold bg-white/5 p-6 rounded-3xl border border-white/10 shadow-inner italic">
                        "{aiAnalysis}"
                        <button 
                          onClick={() => setAiAnalysis(null)}
                          className="ml-4 text-[10px] bg-red-500/20 px-3 py-1.5 rounded-lg uppercase font-black hover:bg-red-500/40 transition-colors"
                        >
                          Dismiss
                        </button>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <div className="px-8 py-5 bg-slate-50 text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] flex justify-between border-t border-slate-100">
              <span className="flex items-center gap-2">Campus Security Framework v2.1</span>
              <span>Sync Protocol: Multi-Relay P2P</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-10 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-slate-400 text-xs font-black uppercase tracking-[0.4em] opacity-50">Gatekeeper Systems • Attendance Intelligence Core</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
