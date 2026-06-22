export type Paper = {
  id: string;
  title: string;
  filePath: string;
  totalPages: number;
  lastPage: number;
  tags: string[];
};

export type Annotation = {
  id: string;
  pageNumber: number;
  highlightedText: string;
  note: string;
  createdAt: string;
};

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};
