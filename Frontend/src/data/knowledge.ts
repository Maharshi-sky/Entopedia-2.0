// Knowledge Hub: documents people upload, from GET /knowledge/documents. No sample data: the page
// shows what is in the database.

export type DocumentStatus = "processing" | "indexed" | "failed";

export type KnowledgeDocument = {
  id: string;
  filename: string;
  fileType: string;
  size: number;
  status: DocumentStatus;
  error: string | null;
  pages: number | null;
  chunks: number | null;
  uploadedBy: string | null;
  uploaderId: string | null;
  createdAt: string;
};

/** One cited excerpt in an answer: "S1" → the file and page it came from. */
export type AnswerSource = { ref: string; documentId: string; filename: string; page: number | null };

// Generic starting points; every answer comes from the uploaded documents.
export const suggestedQuestions: string[] = [
  "Summarise the key findings of the latest uploaded document",
  "Which vaccines or actives are mentioned, and what efficacy is reported?",
  "What risks or open questions do the documents highlight?",
  "List the numbers and statistics cited, with their sources",
];
