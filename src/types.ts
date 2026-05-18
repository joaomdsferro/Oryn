export type Protocol = "rest" | "graphql";
export type BodyMode = "none" | "json" | "text" | "form";

export type RequestPayload = {
  protocol: Protocol;
  method: string;
  url: string;
  params: [string, string][];
  headers: [string, string][];
  body: string | null;
  body_mode: string;
  graphql_query: string;
  graphql_variables: string;
};

export type VarEntry = {
  id: string;
  name: string;
  value: string;
};

export type HttpResponse = {
  status: number;
  status_text: string;
  headers: [string, string][];
  request_headers?: [string, string][];
  body: string;
  elapsed_ms: number;
};

export type LoadRequestPayload = {
  method: string;
  url: string;
  params: [string, string][];
  headers: [string, string][];
  body?: string | null;
  body_mode?: string;
  protocol?: string;
  graphql_query?: string;
  graphql_variables?: string;
  savedId?: string;
  collectionId?: string;
  projectId?: string;
};

export type HistoryMeta = {
  id: string;
  method: string;
  url: string;
  sent_at: string;
  project_id?: string | null;
  project_name?: string | null;
};

export type HistoryEntry = HistoryMeta & {
  params: [string, string][];
  headers: [string, string][];
  body?: string | null;
  response: HttpResponse;
};

export type SavedRequest = {
  id: string;
  name: string;
  protocol: string;
  method: string;
  url: string;
  params: [string, string][];
  headers: [string, string][];
  body?: string | null;
  body_mode: string;
  graphql_query: string;
  graphql_variables: string;
  response: HttpResponse | null;
  saved_at: string;
};

export type RequestMeta = {
  id: string;
  collection_id: string;
  name: string;
  method: string;
  url: string;
  saved_at: string;
};

export type CollectionTree = {
  id: string;
  name: string;
  requests: RequestMeta[];
};

export type CollectionMeta = {
  id: string;
  name: string;
  request_count: number;
};

export type ProjectMeta = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type EnvironmentMeta = {
  id: string;
  name: string;
  variable_count: number;
};

export type EnvVariable = {
  name: string;
  value: string;
};

export type EnvironmentFile = {
  id: string;
  name: string;
  variables: EnvVariable[];
};

export type ActiveContext = {
  project_id: string | null;
  project_name: string | null;
  environment_id: string | null;
  environment_name: string | null;
};

export type SecretMeta = {
  id: string;
  name: string;
  project_id?: string | null;
};

export type SecretFull = SecretMeta & {
  value: string;
};

export type ImportResult = {
  requests: number;
  vars: number;
  secrets: number;
};
