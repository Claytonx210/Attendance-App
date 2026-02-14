
import * as XLSX from 'xlsx';
import { StudentRecord, StudentProfile } from '../types';

export const exportToExcel = (records: StudentRecord[]) => {
  const exportData = records.map(r => ({
    'Student Name': r.name,
    'Student ID': r.studentId,
    'Class': r.class,
    'Arrival Time': r.arrivalTime,
    'Date': r.date,
    'Status': r.status,
    'Verified': r.isVerified ? 'Yes' : 'No'
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const wscols = [
    { wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }
  ];
  worksheet['!cols'] = wscols;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Late Arrivals");

  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `Late_Arrivals_${dateStr}.xlsx`);
};

export const parseRosterFile = (file: File): Promise<StudentProfile[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];
        
        // Map common headers to our StudentProfile format, prioritizing 'class'
        const profiles: StudentProfile[] = json.map(row => ({
          studentId: String(row.studentId || row['ID'] || row['Student ID'] || ''),
          name: String(row.name || row['Name'] || row['Student Name'] || 'Unknown'),
          class: String(row.class || row['Class'] || row['grade'] || row['Grade'] || 'N/A')
        })).filter(p => p.studentId);

        resolve(profiles);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};
