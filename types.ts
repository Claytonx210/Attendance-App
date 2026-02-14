
export interface StudentRecord {
  id: string;
  studentId: string;
  name: string;
  class: string;
  arrivalTime: string;
  date: string;
  status: 'Late' | 'On-Time';
  isVerified: boolean;
}

export interface StudentProfile {
  studentId: string;
  name: string;
  class: string;
}

export interface QRData {
  id: string;
  name?: string;
  class?: string;
}
