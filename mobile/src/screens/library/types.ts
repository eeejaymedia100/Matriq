/** A public library document card (mirrors the backend LibraryDocCard). */
export interface LibraryDoc {
  id: string;
  courseCode: string;
  title: string;
  courseTitle: string | null;
  type: "material" | "past_question";
  mimeType: string;
  sizeBytes: number;
  level: string | null;
  session: string | null;
  description: string | null;
  institution: { id: string; name: string } | null;
  faculty: string | null;
  department: string | null;
  opens: number;
  savesCount: number;
  createdAt: string;
  previewUrl: string | null;
  directUrl: string | null;
  isImage: boolean;
  continuePosition?: string | null;
  continueProgress?: number | null;
}

/** The personalised discovery home (each section only if non-empty). */
export interface LibraryDiscovery {
  continueReading: LibraryDoc[];
  recommended: LibraryDoc[];
  popular: LibraryDoc[];
  trending: LibraryDoc[];
  recent: LibraryDoc[];
  fromYourUniversity: LibraryDoc[];
  fromYourFaculty: LibraryDoc[];
  fromYourDepartment: LibraryDoc[];
  pastQuestions: LibraryDoc[];
  lectureNotes: LibraryDoc[];
  saved: LibraryDoc[];
  hasPersonalization: boolean;
}

export interface LibrarySearchResult {
  items: LibraryDoc[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface LibraryDetail {
  item: LibraryDoc;
  related: LibraryDoc[];
}

export interface LibraryReportReason {
  id: string;
  label: string;
}